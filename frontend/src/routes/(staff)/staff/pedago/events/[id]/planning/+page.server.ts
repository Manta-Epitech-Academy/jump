import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
  timeSlotSchema,
  createActivityFromTemplateSchema,
  createStaticActivitySchema,
} from '$lib/validation/planning';
import { applyPlanningTemplateSchema } from '$lib/validation/planningTemplates';
import { prisma } from '$lib/server/db';
import { EventService } from '$lib/server/services/events';
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
        include: {
          activities: {
            include: { activityThemes: { include: { theme: true } } },
          },
        },
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
  const templateActivityForm = await superValidate(
    zod4(createActivityFromTemplateSchema),
  );
  const staticActivityForm = await superValidate(
    zod4(createStaticActivitySchema),
  );
  const applyTemplateForm = await superValidate(
    zod4(applyPlanningTemplateSchema),
  );

  return {
    event,
    planning,
    templates,
    planningTemplates,
    tsForm,
    templateActivityForm,
    staticActivityForm,
    applyTemplateForm,
    timezone: getCampusTimezone(locals),
  };
};

export const actions: Actions = {
  assignMantas: async ({ request, locals, params }) => {
    const formData = await request.formData();
    const mantas = formData.getAll('mantas') as string[];
    try {
      await EventService.assignMantas(params.id, getCampusId(locals), mantas);
      return { success: true };
    } catch (err) {
      return fail(500, { message: 'Impossible de mettre à jour les Mantas.' });
    }
  },

  ...planningActions,
};
