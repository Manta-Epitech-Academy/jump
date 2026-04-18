import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { toggleBringPc } from '$lib/server/actions/toggleBringPc';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { addParticipantSchema, eventSchema } from '$lib/validation/events';
import {
  timeSlotSchema,
  createActivityFromTemplateSchema,
  createStaticActivitySchema,
} from '$lib/validation/planning';
import { applyPlanningTemplateSchema } from '$lib/validation/planningTemplates';
import { getTotalXp, getXpEligibleActivities } from '$lib/domain/xp';
import { EventService } from '$lib/server/services/events';
import { planningActions } from '$lib/server/services/planningActions';
import { prisma } from '$lib/server/db';
import {
  getCampusId,
  getCampusTimezone,
  scopedPrisma,
} from '$lib/server/db/scoped';
import { CalendarDateTime } from '@internationalized/date';
import { requireStaffGroup } from '$lib/server/auth/guards';

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
    include: { talent: true, stageCompliance: true },
    orderBy: [{ talent: { nom: 'asc' } }, { talent: { prenom: 'asc' } }],
  });

  const themes = await db.theme.findMany({ orderBy: { nom: 'asc' } });
  const staff = await db.staffProfile.findMany({
    include: { user: true },
    orderBy: { user: { name: 'asc' } },
  });

  const tz = getCampusTimezone(locals);
  const eventDate = new Date(event.date);
  const dateString = eventDate.toISOString().split('T')[0];
  const timeParts = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).formatToParts(eventDate);
  const hours = timeParts.find((p) => p.type === 'hour')?.value || '00';
  const minutes = timeParts.find((p) => p.type === 'minute')?.value || '00';
  const timeString = `${hours}:${minutes}`;

  let endDateString = '';
  if (event.endDate) {
    const ed = new Date(event.endDate);
    endDateString = ed.toISOString().split('T')[0];
  }

  const planning = await db.planning.findUniqueOrThrow({
    where: { eventId: params.id },
    include: {
      timeSlots: {
        orderBy: { startTime: 'asc' },
        include: { activities: true },
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

  // FORMS
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
  const tsForm = await superValidate(zod4(timeSlotSchema));
  const staticActivityForm = await superValidate(
    zod4(createStaticActivitySchema),
  );
  const templateActivityForm = await superValidate(
    zod4(createActivityFromTemplateSchema),
  );
  const applyTemplateForm = await superValidate(
    zod4(applyPlanningTemplateSchema),
  );

  return {
    event,
    participations,
    themes,
    staff,
    planning,
    templates,
    planningTemplates,
    editForm,
    addForm,
    tsForm,
    staticActivityForm,
    templateActivityForm,
    applyTemplateForm,
    timezone: tz,
  };
};

export const actions: Actions = {
  // === EVENT & CRM ACTIONS ===
  addExisting: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devMember');
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
      if (existing)
        return message(form, 'Ce Talent est déjà inscrit à cet événement.', {
          status: 400,
        });
      const campusId = getCampusId(locals);
      await prisma.participation.create({
        data: {
          talentId: form.data.studentId,
          eventId: params.id,
          campusId,
          isPresent: false,
        },
      });
      return message(form, 'Talent ajouté !');
    } catch (err) {
      return message(form, "Erreur technique lors de l'ajout.", {
        status: 500,
      });
    }
  },

  updateEvent: async ({ request, locals, params }) => {
    requireStaffGroup(locals, 'devLead');
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
      const tz = getCampusTimezone(locals);
      const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
      const [hour, minute] = timeStr.split(':').map(Number);
      const cdt = new CalendarDateTime(year, month, day, hour, minute);
      const jsDate = cdt.toDate(tz);

      let endDateIso: string | undefined;
      if (endDateStr && endDateStr.trim() !== '') {
        const [ey, em, ed] = endDateStr.split('T')[0].split('-').map(Number);
        const endCdt = new CalendarDateTime(ey, em, ed, 23, 59);
        endDateIso = endCdt.toDate(tz).toISOString();
      }

      await EventService.updateEvent(params.id, getCampusId(locals), {
        ...form.data,
        date: jsDate.toISOString(),
        endDate: endDateIso,
      });

      return message(form, 'Événement mis à jour !');
    } catch (err) {
      return message(form, "Impossible de mettre à jour l'événement", {
        status: 500,
      });
    }
  },

  toggleAdminDoc: async ({ request, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const data = await request.formData();
    const id = data.get('id') as string;
    const docType = data.get('docType') as string;
    const currentState = data.get('state') === 'true';
    const newState = !currentState;
    const db = scopedPrisma(getCampusId(locals));

    try {
      await db.participation.findUniqueOrThrow({
        where: { id },
        select: { id: true },
      });

      const updateData: { [key: string]: boolean } = {};
      if (docType === 'charte') updateData.charteSigned = newState;
      if (docType === 'convention') updateData.conventionSigned = newState;
      if (docType === 'image') updateData.imageRightsSigned = newState;

      await prisma.stageCompliance.upsert({
        where: { participationId: id },
        create: { participationId: id, ...updateData },
        update: updateData,
      });
      return { success: true };
    } catch (err) {
      return fail(500, { error: 'Erreur de mise à jour' });
    }
  },

  toggleBringPc: async ({ request, locals }) => {
    requireStaffGroup(locals, 'devMember');
    const data = await request.formData();
    return toggleBringPc(data, getCampusId(locals));
  },

  remove: async ({ url, locals }) => {
    requireStaffGroup(locals, 'devMember');
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
      return fail(500);
    }
  },

  deleteEvent: async ({ params, locals }) => {
    requireStaffGroup(locals, 'devLead');
    try {
      await EventService.deleteEvent(params.id, getCampusId(locals));
    } catch (err) {
      return fail(500);
    }
    throw redirect(303, resolve('/staff/dev'));
  },

  // === PLANNING ACTIONS ===
  ...planningActions,
};
