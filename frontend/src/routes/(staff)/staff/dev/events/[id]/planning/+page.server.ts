import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { Prisma } from '@prisma/client';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
  type ScopedPrismaClient,
} from '$lib/server/db/scoped';
import { loadEventOr404 } from '$lib/server/services/stageContext';

export const load: PageServerLoad = async ({ locals, params }) => {
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);
  const event = await loadEventOr404(params.id, campusId);

  // Planning is data-driven (not a module): the read-only dev view exists only
  // when the event actually has a schedule. An event with no time slots has
  // nothing to show, so it 404s rather than presenting an empty grid.
  const planning = await loadPlanning(db, params.id);
  if (planning.timeSlots.length === 0) {
    throw error(404, 'Aucun planning pour cet événement.');
  }

  return {
    event,
    planning,
    timezone: getCampusTimezone(locals),
    // Seed for the now-line so SSR and first client render agree.
    serverNow: Date.now(),
  };
};

/**
 * The dev planning page is read-only: it loads the planning (slots + activities)
 * and nothing that powered editing (no template catalogues, no form validations,
 * no actions). The event itself is loaded and module-gated by the caller. A
 * missing planning row (Prisma P2025) becomes a 404; any other error propagates
 * as a 500.
 */
async function loadPlanning(db: ScopedPrismaClient, eventId: string) {
  try {
    return await db.planning.findUniqueOrThrow({
      where: { eventId },
      include: {
        timeSlots: {
          orderBy: { startTime: 'asc' },
          include: { activity: true },
        },
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2025'
    ) {
      throw error(404, 'Planning introuvable.');
    }
    throw e;
  }
}
