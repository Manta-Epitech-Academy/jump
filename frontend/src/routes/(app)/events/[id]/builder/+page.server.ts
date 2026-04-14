import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { addParticipantSchema, eventSchema } from '$lib/validation/events';
import { studentSchema } from '$lib/validation/students';
import {
  timeSlotSchema,
  createActivityFromTemplateSchema,
  createStaticActivitySchema,
} from '$lib/validation/planning';
import { applyPlanningTemplateSchema } from '$lib/validation/planningTemplates';
import { getTotalXp, getXpEligibleActivities } from '$lib/domain/xp';
import { EventService } from '$lib/server/services/events';
import { applyPlanningTemplate } from '$lib/server/services/planningTemplates';
import { prisma } from '$lib/server/db';
import { getCampusId, scopedPrisma } from '$lib/server/db/scoped';
import { CalendarDateTime } from '@internationalized/date';

export const load: PageServerLoad = async ({ locals, params }) => {
  const db = scopedPrisma(getCampusId(locals));
  let event;
  try {
    event = await db.event.findUniqueOrThrow({
      where: { id: params.id },
      include: {
        theme: true,
        mantas: { include: { staffProfile: { include: { user: true } } } },
      },
    });
  } catch {
    throw error(404, 'Événement introuvable');
  }

  const participations = await db.participation.findMany({
    where: { eventId: event.id },
    include: { talent: true },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const themes = await db.theme.findMany({ orderBy: { nom: 'asc' } });

  const staff = await db.staffProfile.findMany({
    include: { user: true },
    orderBy: { user: { name: 'asc' } },
  });

  const eventDate = new Date(event.date);
  const dateString = eventDate.toISOString().split('T')[0];
  const timeParts = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Paris',
  }).formatToParts(eventDate);
  const hours = timeParts.find((p) => p.type === 'hour')?.value || '00';
  const minutes = timeParts.find((p) => p.type === 'minute')?.value || '00';
  const timeString = `${hours}:${minutes}`;

  const planning = await db.planning.findUnique({
    where: { eventId: params.id },
    include: {
      timeSlots: {
        orderBy: { startTime: 'asc' },
        include: { activities: true },
      },
    },
  });

  const campusId = getCampusId(locals);
  const templates = await prisma.activityTemplate.findMany({
    where: { OR: [{ campusId: null }, { campusId }] },
    include: { activityTemplateThemes: { include: { theme: true } } },
    orderBy: { nom: 'asc' },
  });

  let endDateString = '';
  if (event.endDate) {
    const ed = new Date(event.endDate);
    endDateString = ed.toISOString().split('T')[0];
  }

  const editForm = await superValidate(
    {
      titre: event.titre,
      theme: event.theme?.nom || '',
      date: dateString,
      endDate: endDateString,
      time: timeString,
      notes: event.notes || '',
      mantas: event.mantas.map((m) => m.staffProfileId),
    },
    zod4(eventSchema),
  );

  const addForm = await superValidate(zod4(addParticipantSchema));
  const createStudentForm = await superValidate(zod4(studentSchema));
  const tsForm = await superValidate(zod4(timeSlotSchema));
  const staticActivityForm = await superValidate(
    zod4(createStaticActivitySchema),
  );
  const templateActivityForm = await superValidate(
    zod4(createActivityFromTemplateSchema),
  );

  const planningTemplates = await prisma.planningTemplate.findMany({
    orderBy: { nom: 'asc' },
    include: { _count: { select: { days: true } } },
  });
  const applyTemplateForm = await superValidate(
    zod4(applyPlanningTemplateSchema),
  );

  return {
    event,
    participations,
    themes,
    staff,
    addForm,
    createStudentForm,
    editForm,
    planning,
    templates,
    tsForm,
    staticActivityForm,
    templateActivityForm,
    planningTemplates,
    applyTemplateForm,
  };
};

export const actions: Actions = {
  addExisting: async ({ request, locals, params }) => {
    const form = await superValidate(request, zod4(addParticipantSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const existing = await prisma.participation.findUnique({
        where: {
          talentId_eventId: {
            talentId: form.data.studentId,
            eventId: params.id,
          },
        },
      });

      if (existing) {
        return message(form, 'Cet élève est déjà inscrit à cet événement.', {
          status: 400,
        });
      }

      const campusId = getCampusId(locals);
      await prisma.participation.create({
        data: {
          talentId: form.data.studentId,
          eventId: params.id,
          campusId,
          isPresent: false,
        },
      });

      return message(form, 'Élève ajouté !');
    } catch (err) {
      console.error(err);
      return message(form, "Erreur technique lors de l'ajout.", {
        status: 500,
      });
    }
  },

  quickCreateStudent: async ({ request, locals, params }) => {
    const form = await superValidate(request, zod4(studentSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const campusId = getCampusId(locals);

      const email =
        form.data.email || `${crypto.randomUUID()}@placeholder.local`;

      const user = await prisma.bauth_user.create({
        data: {
          email,
          role: 'student',
          name: `${form.data.prenom} ${form.data.nom}`,
          talent: {
            create: {
              nom: form.data.nom,
              prenom: form.data.prenom,
              email,
              campusId,
              niveau: form.data.niveau || null,
              niveauDifficulte: form.data.niveau_difficulte || 'Débutant',
              xp: 0,
              eventsCount: 0,
              parentEmail: form.data.parent_email || null,
              parentPhone: form.data.parent_phone || null,
              phone: form.data.phone || null,
            },
          },
        },
        include: { talent: true },
      });

      const talentId = user.talent!.id;

      await prisma.participation.create({
        data: {
          talentId,
          eventId: params.id,
          campusId,
          isPresent: false,
        },
      });

      return message(form, 'Élève créé et inscrit !');
    } catch (err: any) {
      if (err.code === 'P2002') {
        return message(
          form,
          'Un élève identique (même nom, prénom et email) existe déjà.',
          { status: 400 },
        );
      }
      console.error('Quick create student error:', err);
      return message(form, 'Erreur lors de la création rapide.', {
        status: 500,
      });
    }
  },

  updateEvent: async ({ request, locals, params }) => {
    const formData = await request.formData();
    const dateStr = formData.get('date') as string;
    const timeStr = formData.get('time') as string;

    const endDateStr = formData.get('endDate') as string;

    const transformedData = {
      titre: (formData.get('titre') as string) || '',
      date: dateStr,
      endDate: endDateStr || '',
      time: timeStr,
      theme: formData.get('theme') as string,
      notes: formData.get('notes') as string,
      mantas: formData.getAll('mantas') as string[],
    };

    const form = await superValidate(transformedData, zod4(eventSchema));
    if (!form.valid) return fail(400, { form });

    try {
      if (!dateStr || !timeStr) throw new Error('Date ou heure manquante');

      const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
      const [hour, minute] = timeStr.split(':').map(Number);
      const cdt = new CalendarDateTime(year, month, day, hour, minute);
      const jsDate = cdt.toDate('Europe/Paris');

      if (isNaN(jsDate.getTime())) {
        return message(form, 'Format de date invalide', { status: 400 });
      }

      let endDateIso: string | undefined;
      if (endDateStr && endDateStr.trim() !== '') {
        const [ey, em, ed] = endDateStr.split('T')[0].split('-').map(Number);
        const endCdt = new CalendarDateTime(ey, em, ed, 23, 59);
        const endJsDate = endCdt.toDate('Europe/Paris');
        if (!isNaN(endJsDate.getTime())) {
          endDateIso = endJsDate.toISOString();
        }
      }

      const campusId = getCampusId(locals);
      await EventService.updateEvent(params.id, campusId, {
        ...form.data,
        date: jsDate.toISOString(),
        endDate: endDateIso,
      });

      return message(form, 'Événement mis à jour !');
    } catch (err) {
      console.error('Update Event Error:', err);
      return message(form, "Impossible de mettre à jour l'événement", {
        status: 500,
      });
    }
  },

  toggleBringPc: async ({ request, locals }) => {
    const data = await request.formData();
    return toggleBringPc(data, getCampusId(locals));
  },

  remove: async ({ url, locals }) => {
    const id = url.searchParams.get('id');
    if (!id) return fail(400);
    const db = scopedPrisma(getCampusId(locals));

    try {
      const p = await db.participation.findUniqueOrThrow({
        where: { id },
        include: { activities: { include: { activity: true } } },
      });

      if (p.isPresent) {
        const xpValue = getTotalXp(getXpEligibleActivities(p.activities));

        const profile = await prisma.talent.findUniqueOrThrow({
          where: { id: p.talentId },
          select: { xp: true, eventsCount: true },
        });
        await prisma.talent.update({
          where: { id: p.talentId },
          data: {
            xp: Math.max(0, profile.xp - xpValue),
            eventsCount: Math.max(0, profile.eventsCount - 1),
          },
        });
      }

      await prisma.participation.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      console.error('Remove participation error:', err);
      return fail(500);
    }
  },

  deleteEvent: async ({ params, locals }) => {
    try {
      await EventService.deleteEvent(params.id, getCampusId(locals));
    } catch (err) {
      console.error('Delete event error:', err);
      return fail(500);
    }
    throw redirect(303, resolve('/'));
  },

  createTimeSlot: async ({ request, locals, params }) => {
    const form = await superValidate(request, zod4(timeSlotSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const db = scopedPrisma(getCampusId(locals));
      const event = await db.event.findUniqueOrThrow({
        where: { id: params.id },
      });

      const eventDate = new Date(event.date);
      const [startH, startM] = form.data.startTime.split(':').map(Number);
      const [endH, endM] = form.data.endTime.split(':').map(Number);

      const startCdt = new CalendarDateTime(
        eventDate.getFullYear(),
        eventDate.getMonth() + 1,
        eventDate.getDate(),
        startH,
        startM,
      );
      const endCdt = new CalendarDateTime(
        eventDate.getFullYear(),
        eventDate.getMonth() + 1,
        eventDate.getDate(),
        endH,
        endM,
      );

      const planning = await prisma.planning.upsert({
        where: { eventId: params.id },
        create: { eventId: params.id },
        update: {},
      });

      await db.timeSlot.create({
        data: {
          planningId: planning.id,
          startTime: startCdt.toDate('Europe/Paris'),
          endTime: endCdt.toDate('Europe/Paris'),
          label: form.data.label || null,
        },
      });

      return message(form, 'Créneau ajouté !');
    } catch (err) {
      console.error('Create time slot error:', err);
      return message(form, 'Erreur lors de la création du créneau.', {
        status: 500,
      });
    }
  },

  updateTimeSlot: async ({ request, locals, params }) => {
    const formData = await request.formData();
    const timeSlotId = formData.get('timeSlotId') as string;
    if (!timeSlotId) return fail(400);

    const form = await superValidate(formData, zod4(timeSlotSchema));
    if (!form.valid) return fail(400, { form });

    try {
      const db = scopedPrisma(getCampusId(locals));
      const event = await db.event.findUniqueOrThrow({
        where: { id: params.id },
      });

      const eventDate = new Date(event.date);
      const [startH, startM] = form.data.startTime.split(':').map(Number);
      const [endH, endM] = form.data.endTime.split(':').map(Number);

      const startCdt = new CalendarDateTime(
        eventDate.getFullYear(),
        eventDate.getMonth() + 1,
        eventDate.getDate(),
        startH,
        startM,
      );
      const endCdt = new CalendarDateTime(
        eventDate.getFullYear(),
        eventDate.getMonth() + 1,
        eventDate.getDate(),
        endH,
        endM,
      );

      await db.timeSlot.update({
        where: { id: timeSlotId },
        data: {
          startTime: startCdt.toDate('Europe/Paris'),
          endTime: endCdt.toDate('Europe/Paris'),
          label: form.data.label || null,
        },
      });

      return message(form, 'Créneau mis à jour !');
    } catch (err) {
      console.error('Update time slot error:', err);
      return message(form, 'Erreur lors de la mise à jour du créneau.', {
        status: 500,
      });
    }
  },

  deleteTimeSlot: async ({ url, locals, params }) => {
    const timeSlotId = url.searchParams.get('id');
    if (!timeSlotId) return fail(400);

    try {
      const db = scopedPrisma(getCampusId(locals));

      await db.timeSlot.delete({ where: { id: timeSlotId } });
      return { success: true };
    } catch (err) {
      console.error('Delete time slot error:', err);
      return fail(500);
    }
  },

  addActivityFromTemplate: async ({ request, locals, params }) => {
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

      return message(form, `Activité "${template.nom}" ajoutée !`);
    } catch (err) {
      console.error('Add activity from template error:', err);
      return message(form, "Erreur lors de l'ajout de l'activité.", {
        status: 500,
      });
    }
  },

  createStaticActivity: async ({ request, locals, params }) => {
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
      console.error('Create static activity error:', err);
      return message(form, "Erreur lors de la création de l'activité.", {
        status: 500,
      });
    }
  },

  deleteActivity: async ({ url, locals, params }) => {
    const activityId = url.searchParams.get('id');
    if (!activityId) return fail(400);

    try {
      const db = scopedPrisma(getCampusId(locals));

      await db.activity.delete({ where: { id: activityId } });
      return { success: true };
    } catch (err) {
      console.error('Delete activity error:', err);
      return fail(500);
    }
  },

  applyTemplate: async ({ request, locals, params }) => {
    const form = await superValidate(
      request,
      zod4(applyPlanningTemplateSchema),
    );
    if (!form.valid) return fail(400, { form });

    try {
      const campusId = getCampusId(locals);
      await applyPlanningTemplate(
        form.data.planningTemplateId,
        params.id,
        campusId,
      );

      return message(form, 'Modèle de planning appliqué avec succès !');
    } catch (err) {
      console.error('Apply planning template error:', err);
      return message(form, "Erreur lors de l'application du modèle.", {
        status: 500,
      });
    }
  },
};
