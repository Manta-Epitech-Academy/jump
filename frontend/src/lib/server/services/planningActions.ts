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
import { sanitizeRichHtml } from '$lib/server/sanitize';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { fromWallClock, isDateKey, toDateKey } from '$lib/domain/planningTime';
import { requireFlag, requireStaffGroup } from '$lib/server/auth/guards';

type PlanningEvent = RequestEvent<{ id: string }>;

// Every planning mutation needs both gates: the campus must have the planning
// feature on, and the actor must be a workspace lead. Keeping them in one
// helper stops the two from drifting apart across the ~10 actions below.
function requirePlanningLead(locals: App.Locals) {
  requireFlag(locals, 'planning');
  requireStaffGroup(locals, 'leads');
}

// Builds the UTC start/end instants for a slot from the form's wall-clock
// inputs. The `slotDate` form field is the campus-local calendar day the user
// actually clicked on; if it's missing or malformed we fall back to the
// event's own date (also resolved in the campus TZ) so both inputs share the
// same frame of reference.
function buildSlotInstants(
  slotDateKey: string | null | undefined,
  fallback: Date,
  startTime: string,
  endTime: string,
  tz: string,
) {
  const dateKey =
    slotDateKey && isDateKey(slotDateKey)
      ? slotDateKey
      : toDateKey(fallback, tz);
  return {
    start: fromWallClock(dateKey, startTime, tz),
    end: fromWallClock(dateKey, endTime, tz),
  };
}

export const planningActions = {
  // Creates an empty TimeSlot (no Activity). The slot renders as "to be
  // assigned" until the user picks an activity for it.
  createTimeSlot: async ({ request, locals, params }: PlanningEvent) => {
    requirePlanningLead(locals);
    const formData = await request.formData();
    const form = await superValidate(formData, zod4(timeSlotSchema));
    if (!form.valid) return fail(400, { form });
    try {
      const db = scopedPrisma(getCampusId(locals));
      const tz = getCampusTimezone(locals);
      const event = await db.event.findUniqueOrThrow({
        where: { id: params.id },
      });
      const { start, end } = buildSlotInstants(
        form.data.slotDate,
        event.date,
        form.data.startTime,
        form.data.endTime,
        tz,
      );
      const planning = await db.planning.findUniqueOrThrow({
        where: { eventId: params.id },
      });
      const slot = await db.timeSlot.create({
        data: {
          planningId: planning.id,
          startTime: start,
          endTime: end,
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
    requirePlanningLead(locals);
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
            subjectVersionId: template.subjectVersionId,
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
        // superRefine guarantees these are set when templateId is absent, but
        // narrow here for Prisma's required types.
        if (!form.data.nom || !form.data.activityType) {
          return fail(400, { form });
        }
        await db.activity.create({
          data: {
            nom: form.data.nom,
            description: form.data.description || null,
            difficulte: form.data.difficulte || null,
            activityType: form.data.activityType,
            isDynamic: false,
            link: form.data.link || null,
            content: form.data.content
              ? sanitizeRichHtml(form.data.content)
              : null,
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
    requirePlanningLead(locals);
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

      const { start, end } = buildSlotInstants(
        form.data.slotDate,
        event.date,
        form.data.startTime,
        form.data.endTime,
        tz,
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

      const slot = await db.timeSlot.create({
        data: {
          planningId: planning.id,
          startTime: start,
          endTime: end,
          activity: {
            create: template
              ? {
                  nom: template.nom,
                  description: template.description,
                  difficulte: template.difficulte,
                  activityType: template.activityType,
                  isDynamic: template.isDynamic,
                  link: template.link,
                  content: template.content,
                  contentStructure: template.contentStructure ?? undefined,
                  subjectVersionId: template.subjectVersionId,
                  templateId: template.id,
                  activityThemes:
                    template.activityTemplateThemes.length > 0
                      ? {
                          create: template.activityTemplateThemes.map(
                            (att) => ({ themeId: att.themeId }),
                          ),
                        }
                      : undefined,
                }
              : {
                  nom: form.data.nom?.trim() || '',
                  activityType: form.data.activityType,
                  isDynamic: false,
                },
          },
        },
        include: {
          activity: {
            include: { activityThemes: { include: { theme: true } } },
          },
        },
      });
      const created = { slot, activity: slot.activity! };

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
    requirePlanningLead(locals);
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

      const { start, end } = buildSlotInstants(
        form.data.slotDate,
        event.date,
        form.data.startTime,
        form.data.endTime,
        tz,
      );

      await db.timeSlot.update({
        where: { id: timeSlotId },
        data: {
          startTime: start,
          endTime: end,
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
    requirePlanningLead(locals);
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
    requirePlanningLead(locals);
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
    requirePlanningLead(locals);
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
    requirePlanningLead(locals);
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
    requirePlanningLead(locals);
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
    requirePlanningLead(locals);
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
