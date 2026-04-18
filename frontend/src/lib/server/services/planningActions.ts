import { fail, type RequestEvent } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
  timeSlotSchema,
  createActivityFromTemplateSchema,
  createStaticActivitySchema,
} from '$lib/validation/planning';
import { applyPlanningTemplateSchema } from '$lib/validation/planningTemplates';
import { applyPlanningTemplate } from './planningTemplates';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { CalendarDateTime } from '@internationalized/date';
import { requireStaffGroup } from '$lib/server/auth/guards';

type PlanningEvent = RequestEvent<{ id: string }>;

function parseSlotDateTimes(
  slotDateStr: string | null,
  fallback: Date,
  startTime: string,
  endTime: string,
) {
  const targetDate = slotDateStr ? new Date(slotDateStr) : fallback;
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const startCdt = new CalendarDateTime(
    targetDate.getFullYear(),
    targetDate.getMonth() + 1,
    targetDate.getDate(),
    startH,
    startM,
  );
  const endCdt = new CalendarDateTime(
    targetDate.getFullYear(),
    targetDate.getMonth() + 1,
    targetDate.getDate(),
    endH,
    endM,
  );
  return { startCdt, endCdt };
}

export const planningActions = {
  createTimeSlot: async ({ request, locals, params }: PlanningEvent) => {
    requireStaffGroup(locals, 'leads');
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(timeSlotSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const db = scopedPrisma(getCampusId(locals));
      const tz = getCampusTimezone(locals);
      const event = await db.event.findUniqueOrThrow({
        where: { id: params.id },
      });

      const { startCdt, endCdt } = parseSlotDateTimes(
        formData.get('slotDate') as string | null,
        event.date,
        form.data.startTime,
        form.data.endTime,
      );

      const planning = await db.planning.findUniqueOrThrow({
        where: { eventId: params.id },
      });

      await db.timeSlot.create({
        data: {
          planningId: planning.id,
          startTime: startCdt.toDate(tz),
          endTime: endCdt.toDate(tz),
          label: form.data.label || null,
        },
      });
      return message(form, 'Créneau ajouté !');
    } catch (err) {
      console.error('createTimeSlot failed', err);
      return message(form, 'Erreur lors de la création du créneau.', {
        status: 500,
      });
    }
  },

  updateTimeSlot: async ({ request, locals, params }: PlanningEvent) => {
    requireStaffGroup(locals, 'leads');
    const formData = await request.formData();
    const timeSlotId = formData.get('timeSlotId') as string;
    if (!timeSlotId) return fail(400);

    const form = await superValidate(formData, zod4(timeSlotSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const db = scopedPrisma(getCampusId(locals));
      const tz = getCampusTimezone(locals);
      const event = await db.event.findUniqueOrThrow({
        where: { id: params.id },
      });

      const { startCdt, endCdt } = parseSlotDateTimes(
        formData.get('slotDate') as string | null,
        event.date,
        form.data.startTime,
        form.data.endTime,
      );

      await db.timeSlot.update({
        where: { id: timeSlotId },
        data: {
          startTime: startCdt.toDate(tz),
          endTime: endCdt.toDate(tz),
          label: form.data.label || null,
        },
      });
      return message(form, 'Créneau mis à jour !');
    } catch (err) {
      console.error('updateTimeSlot failed', err);
      return message(form, 'Erreur lors de la mise à jour du créneau.', {
        status: 500,
      });
    }
  },

  deleteTimeSlot: async ({ url, locals }: PlanningEvent) => {
    requireStaffGroup(locals, 'leads');
    const timeSlotId = url.searchParams.get('id');
    if (!timeSlotId) return fail(400);
    try {
      const db = scopedPrisma(getCampusId(locals));
      await db.timeSlot.delete({ where: { id: timeSlotId } });
      return { success: true };
    } catch (err) {
      console.error('deleteTimeSlot failed', err);
      return fail(500);
    }
  },

  addActivityFromTemplate: async ({ request, locals }: PlanningEvent) => {
    requireStaffGroup(locals, 'leads');
    const form = await superValidate(
      request,
      zod4(createActivityFromTemplateSchema),
    );
    if (!form.valid) return fail(400, { form });

    try {
      const db = scopedPrisma(getCampusId(locals));
      const template = await prisma.activityTemplate.findUniqueOrThrow({
        where: { id: form.data.templateId },
        include: { activityTemplateThemes: true },
      });

      await db.activity.create({
        data: {
          nom: template.nom,
          description: template.description,
          difficulte: template.difficulte,
          activityType: template.activityType,
          isDynamic: template.isDynamic,
          link: template.link,
          content: template.content,
          contentStructure: template.contentStructure ?? undefined,
          templateId: template.id,
          timeSlotId: form.data.timeSlotId,
          activityThemes:
            template.activityTemplateThemes.length > 0
              ? {
                  create: template.activityTemplateThemes.map((att) => ({
                    themeId: att.themeId,
                  })),
                }
              : undefined,
        },
      });
      return message(form, `Activité "${template.nom}" ajoutée au planning !`);
    } catch (err) {
      console.error('addActivityFromTemplate failed', err);
      return message(form, "Erreur lors de l'ajout de l'activité.", {
        status: 500,
      });
    }
  },

  createStaticActivity: async ({ request, locals }: PlanningEvent) => {
    requireStaffGroup(locals, 'leads');
    const form = await superValidate(request, zod4(createStaticActivitySchema));
    if (!form.valid) return fail(400, { form });

    try {
      const db = scopedPrisma(getCampusId(locals));
      await db.activity.create({
        data: {
          nom: form.data.nom,
          description: form.data.description || null,
          difficulte: form.data.difficulte || null,
          activityType: form.data.activityType,
          isDynamic: false,
          link: form.data.link || null,
          content: form.data.content,
          timeSlotId: form.data.timeSlotId,
        },
      });
      return message(form, `Activité "${form.data.nom}" créée !`);
    } catch (err) {
      console.error('createStaticActivity failed', err);
      return message(form, "Erreur lors de la création de l'activité.", {
        status: 500,
      });
    }
  },

  deleteActivity: async ({ url, locals }: PlanningEvent) => {
    requireStaffGroup(locals, 'leads');
    const activityId = url.searchParams.get('id');
    if (!activityId) return fail(400);
    try {
      const db = scopedPrisma(getCampusId(locals));
      await db.activity.delete({ where: { id: activityId } });
      return { success: true };
    } catch (err) {
      console.error('deleteActivity failed', err);
      return fail(500);
    }
  },

  applyTemplate: async ({ request, locals, params }: PlanningEvent) => {
    requireStaffGroup(locals, 'leads');
    const form = await superValidate(
      request,
      zod4(applyPlanningTemplateSchema),
    );
    if (!form.valid) return fail(400, { form });

    try {
      await applyPlanningTemplate(
        form.data.planningTemplateId,
        params.id,
        getCampusId(locals),
        getCampusTimezone(locals),
      );
      return message(form, 'Modèle de planning appliqué avec succès !');
    } catch (err) {
      console.error('applyTemplate failed', err);
      return message(form, "Erreur lors de l'application du modèle.", {
        status: 500,
      });
    }
  },
};
