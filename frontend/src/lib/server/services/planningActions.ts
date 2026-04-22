import { fail, type RequestEvent } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import {
  timeSlotSchema,
  createSlotWithActivitySchema,
  renameActivitySchema,
  changeActivityTypeSchema,
  updateActivitySchema,
  assignActivitySchema,
} from '$lib/validation/planning';
import { applyPlanningTemplateSchema } from '$lib/validation/planningTemplates';
import { applyPlanningTemplate } from './planningTemplates';
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
  // Creates an empty TimeSlot (no Activity). The slot renders as "to be
  // assigned" until the user picks an activity for it.
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
      const slot = await db.timeSlot.create({
        data: {
          planningId: planning.id,
          startTime: startCdt.toDate(tz),
          endTime: endCdt.toDate(tz),
        },
      });
      return message(form, { text: 'Créneau ajouté !', slotId: slot.id });
    } catch (err) {
      console.error('createTimeSlot failed', err);
      return message(
        form,
        { text: 'Erreur lors de la création du créneau.' },
        { status: 500 },
      );
    }
  },

  // Assigns an activity to an existing empty slot. Accepts either inline
  // fields or a templateId for template-based assignment.
  assignActivity: async ({ request, locals }: PlanningEvent) => {
    requireStaffGroup(locals, 'leads');
    const form = await superValidate(request, zod4(assignActivitySchema));
    if (!form.valid) return fail(400, { form });
    try {
      const db = scopedPrisma(getCampusId(locals));
      const existing = await db.activity.findUnique({
        where: { timeSlotId: form.data.timeSlotId },
      });
      if (existing) {
        return message(
          form,
          { text: 'Ce créneau a déjà une activité.' },
          { status: 400 },
        );
      }

      const templateId = form.data.templateId || null;
      if (templateId) {
        const template = await db.activityTemplate.findUniqueOrThrow({
          where: { id: templateId },
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
      } else {
        await db.activity.create({
          data: {
            nom: form.data.nom,
            description: form.data.description || null,
            difficulte: form.data.difficulte || null,
            activityType: form.data.activityType,
            isDynamic: false,
            link: form.data.link || null,
            content: form.data.content || null,
            timeSlotId: form.data.timeSlotId,
          },
        });
      }
      return message(form, 'Activité assignée !');
    } catch (err) {
      console.error('assignActivity failed', err);
      return message(
        form,
        { text: "Erreur lors de l'assignation." },
        { status: 500 },
      );
    }
  },

  createSlotWithActivity: async ({
    request,
    locals,
    params,
  }: PlanningEvent) => {
    requireStaffGroup(locals, 'leads');
    const formData = await request.formData();
    const form = await superValidate(
      formData,
      zod4(createSlotWithActivitySchema),
    );
    if (!form.valid) return fail(400, { form });

    try {
      const db = scopedPrisma(getCampusId(locals));
      const tz = getCampusTimezone(locals);
      const event = await db.event.findUniqueOrThrow({
        where: { id: params.id },
      });

      const { startCdt, endCdt } = parseSlotDateTimes(
        form.data.slotDate || null,
        event.date,
        form.data.startTime,
        form.data.endTime,
      );

      const planning = await db.planning.findUniqueOrThrow({
        where: { eventId: params.id },
      });

      const templateId = form.data.templateId || null;
      const template = templateId
        ? await db.activityTemplate.findUnique({
            where: { id: templateId },
            include: { activityTemplateThemes: true },
          })
        : null;

      const created = await db.$transaction(async (tx) => {
        const slot = await tx.timeSlot.create({
          data: {
            planningId: planning.id,
            startTime: startCdt.toDate(tz),
            endTime: endCdt.toDate(tz),
          },
        });

        const activity = await tx.activity.create({
          data: template
            ? {
                nom: template.nom,
                description: template.description,
                difficulte: template.difficulte,
                activityType: template.activityType,
                isDynamic: template.isDynamic,
                link: template.link,
                content: template.content,
                contentStructure: template.contentStructure ?? undefined,
                templateId: template.id,
                timeSlotId: slot.id,
                activityThemes:
                  template.activityTemplateThemes.length > 0
                    ? {
                        create: template.activityTemplateThemes.map((att) => ({
                          themeId: att.themeId,
                        })),
                      }
                    : undefined,
              }
            : {
                nom: form.data.nom?.trim() || '',
                activityType: form.data.activityType,
                isDynamic: false,
                timeSlotId: slot.id,
              },
          include: { activityThemes: { include: { theme: true } } },
        });

        return { slot, activity };
      });

      return message(form, {
        text: 'Créneau ajouté !',
        slotId: created.slot.id,
        activityId: created.activity.id,
      });
    } catch (err) {
      console.error('createSlotWithActivity failed', err);
      return message(
        form,
        { text: 'Erreur lors de la création du créneau.' },
        { status: 500 },
      );
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

  renameActivity: async ({ request, locals }: PlanningEvent) => {
    requireStaffGroup(locals, 'leads');
    const form = await superValidate(request, zod4(renameActivitySchema));
    if (!form.valid) return fail(400, { form });

    try {
      const db = scopedPrisma(getCampusId(locals));
      await db.activity.update({
        where: { id: form.data.activityId },
        data: { nom: form.data.nom },
      });
      return message(form, 'Activité renommée !');
    } catch (err) {
      console.error('renameActivity failed', err);
      return message(form, 'Erreur lors du renommage.', { status: 500 });
    }
  },

  updateActivity: async ({ request, locals }: PlanningEvent) => {
    requireStaffGroup(locals, 'leads');
    const form = await superValidate(request, zod4(updateActivitySchema));
    if (!form.valid) return fail(400, { form });
    try {
      const db = scopedPrisma(getCampusId(locals));
      await db.activity.update({
        where: { id: form.data.activityId },
        data: {
          nom: form.data.nom,
          activityType: form.data.activityType,
          description: form.data.description || null,
          difficulte: form.data.difficulte || null,
          link: form.data.link || null,
          content: form.data.content || null,
        },
      });
      return message(form, 'Activité mise à jour !');
    } catch (err) {
      console.error('updateActivity failed', err);
      return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
    }
  },

  changeActivityType: async ({ request, locals }: PlanningEvent) => {
    requireStaffGroup(locals, 'leads');
    const form = await superValidate(request, zod4(changeActivityTypeSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const db = scopedPrisma(getCampusId(locals));
      // Changing the type means breaking any template link (the new type may
      // not match the template's semantics, and the activity is no longer a
      // faithful copy of it).
      await db.activity.update({
        where: { id: form.data.activityId },
        data: { activityType: form.data.activityType, templateId: null },
      });
      return message(form, 'Type mis à jour !');
    } catch (err) {
      console.error('changeActivityType failed', err);
      return message(form, 'Erreur lors du changement de type.', {
        status: 500,
      });
    }
  },

  deleteActivity: async ({ url, locals }: PlanningEvent) => {
    // Deleting the activity also deletes its slot — the 1:1 invariant means an
    // empty slot is not a valid state.
    requireStaffGroup(locals, 'leads');
    const activityId = url.searchParams.get('id');
    if (!activityId) return fail(400);
    try {
      const db = scopedPrisma(getCampusId(locals));
      const activity = await db.activity.findUniqueOrThrow({
        where: { id: activityId },
        select: { timeSlotId: true },
      });
      await db.timeSlot.delete({ where: { id: activity.timeSlotId } });
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
