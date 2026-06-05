import type { PageServerLoad, Actions } from './$types';
import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
  timeSlotSchema,
  createSlotWithActivitySchema,
  renameActivitySchema,
  changeActivityTypeSchema,
} from '$lib/validation/planning';
import { applyPlanningTemplateSchema } from '$lib/validation/planningTemplates';
import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { planningActions } from '$lib/server/services/planningActions';
import { requireFlag } from '$lib/server/auth/guards';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
  type ScopedPrismaClient,
} from '$lib/server/db/scoped';

export const load: PageServerLoad = async ({ locals, params }) => {
  requireFlag(locals, 'event_planning');
  const campusId = getCampusId(locals);
  const db = scopedPrisma(campusId);

  // event, planning and both template lists are independent reads, resolved
  // in one wave. Only the two findUniqueOrThrow can fail "not found" (Prisma
  // P2025); loadPlanningData maps that to a 404 and lets any real DB error
  // surface as a 500 rather than masquerading as a missing event.
  const [event, planning, templates, planningTemplates] =
    await loadPlanningData(db, params.id, campusId);

  const tsForm = await superValidate(zod4(timeSlotSchema));
  const createSlotForm = await superValidate(
    zod4(createSlotWithActivitySchema),
  );
  const renameActivityForm = await superValidate(zod4(renameActivitySchema));
  const changeTypeForm = await superValidate(zod4(changeActivityTypeSchema));
  const applyTemplateForm = await superValidate(
    zod4(applyPlanningTemplateSchema),
  );

  return {
    event,
    planning,
    templates,
    planningTemplates,
    tsForm,
    createSlotForm,
    renameActivityForm,
    changeTypeForm,
    applyTemplateForm,
    timezone: getCampusTimezone(locals),
  };
};

/**
 * Loads the planning page's four independent reads in one wave: the event,
 * its planning (slots + activities + subject-section counts), and the campus
 * activity / planning template catalogues. A missing event or planning row
 * (Prisma P2025) becomes a 404; any other error propagates as a 500.
 */
async function loadPlanningData(
  db: ScopedPrismaClient,
  eventId: string,
  campusId: string,
) {
  try {
    return await Promise.all([
      db.event.findUniqueOrThrow({
        where: { id: eventId },
        include: { theme: true },
      }),
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
      prisma.activityTemplate.findMany({
        where: { OR: [{ campusId: null }, { campusId }] },
        include: { activityTemplateThemes: { include: { theme: true } } },
        orderBy: { nom: 'asc' },
      }),
      prisma.planningTemplate.findMany({
        orderBy: { nom: 'asc' },
        include: { _count: { select: { days: true } } },
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

export const actions: Actions = Object.fromEntries(
  Object.entries(planningActions).map(([name, fn]) => [
    name,
    async (event) => {
      requireFlag(event.locals, 'event_planning');
      return fn(event);
    },
  ]),
) as Actions;
