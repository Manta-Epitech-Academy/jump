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
import { prisma } from '$lib/server/db';
import { planningActions } from '$lib/server/services/planningActions';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';

export const load: PageServerLoad = async ({ locals, params }) => {
  const db = scopedPrisma(getCampusId(locals));

  let event;
  try {
    event = await db.event.findUniqueOrThrow({
      where: { id: params.id },
      include: { theme: true },
    });
  } catch {
    throw error(404, 'Événement introuvable');
  }

  const planning = await db.planning.findUniqueOrThrow({
    where: { eventId: params.id },
    include: {
      timeSlots: {
        orderBy: { startTime: 'asc' },
        include: { activity: true },
      },
    },
  });

  const templates = await prisma.activityTemplate.findMany({
    where: { OR: [{ campusId: null }, { campusId: getCampusId(locals) }] },
    include: { activityTemplateThemes: { include: { theme: true } } },
    orderBy: { nom: 'asc' },
  });

  const planningTemplates = await prisma.planningTemplate.findMany({
    orderBy: { nom: 'asc' },
    include: { _count: { select: { days: true } } },
  });

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

export const actions: Actions = {
  ...planningActions,
};
