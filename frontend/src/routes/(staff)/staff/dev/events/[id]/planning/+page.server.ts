import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
  type ScopedPrismaClient,
} from '$lib/server/db/scoped';
import { requireFlag } from '$lib/server/auth/guards';

export const load: PageServerLoad = async ({ locals, params }) => {
  requireFlag(locals, 'planning');
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);

  const [event, planning] = await loadPlanningData(db, params.id);

  return {
    event,
    planning,
    timezone: getCampusTimezone(locals),
    // Seed for the now-line so SSR and first client render agree.
    serverNow: Date.now(),
  };
};

/**
 * The dev planning page is read-only: it loads the event and its planning (slots
 * + activities + subject-section counts) and nothing that powered editing (no
 * template catalogues, no form validations, no actions). A missing event or
 * planning row (Prisma P2025) becomes a 404; any other error propagates as a 500.
 */
async function loadPlanningData(db: ScopedPrismaClient, eventId: string) {
  try {
    return await Promise.all([
      db.event.findUniqueOrThrow({ where: { id: eventId } }),
      db.planning.findUniqueOrThrow({
        where: { eventId },
        include: {
          timeSlots: {
            orderBy: { startTime: 'asc' },
            include: {
              activity: {
                include: {
                  subjectVersion: {
                    select: {
                      id: true,
                      _count: {
                        select: { sections: { where: { level: 1 } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2025'
    ) {
      throw error(404, 'Événement introuvable');
    }
    throw e;
  }
}
