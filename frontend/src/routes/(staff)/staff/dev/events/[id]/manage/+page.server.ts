import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { eventSchema } from '$lib/validation/events';
import { EventService } from '$lib/server/services/events';
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
    include: { stageCompliance: true },
    orderBy: [{ talent: { nom: 'asc' } }],
  });

  const interviewsCompleted = await db.interview.count({
    where: { participation: { eventId: event.id }, status: 'completed' },
  });

  const themes = await db.theme.findMany({ orderBy: { nom: 'asc' } });
  const assignedMantaIds = event.mantas.map((m) => m.staffProfileId);
  const staff = await db.staffProfile.findMany({
    where: {
      OR: [
        { staffRole: { in: ['manta', 'peda'] } },
        { id: { in: assignedMantaIds } },
      ],
    },
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

  const total = participations.length;
  const stats = {
    total,
    bringPc: participations.filter((p) => p.bringPc).length,
    chartes: participations.filter((p) => p.stageCompliance?.charteSigned)
      .length,
    conventions: participations.filter(
      (p) => p.stageCompliance?.conventionSigned,
    ).length,
    droitsImage: participations.filter(
      (p) => p.stageCompliance?.imageRightsSigned,
    ).length,
    interviewsCompleted,
  };

  const staffIds = new Set(staff.map((s) => s.id));
  const editForm = await superValidate(
    {
      titre: event.titre,
      theme: event.theme?.nom || '',
      date: dateString,
      endDate: endDateString,
      time: timeString,
      notes: event.notes || '',
      mantas: event.mantas
        .map((m) => m.staffProfileId)
        .filter((id) => staffIds.has(id)),
    },
    zod4(eventSchema),
  );

  return {
    event,
    stats,
    themes,
    staff,
    editForm,
    timezone: tz,
  };
};

export const actions: Actions = {
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
  },

  deleteEvent: async ({ params, locals }) => {
    requireStaffGroup(locals, 'devLead');
    try {
      await EventService.deleteEvent(params.id, getCampusId(locals));
    } catch {
      return fail(500);
    }
    throw redirect(303, resolve('/staff/dev'));
  },
};
