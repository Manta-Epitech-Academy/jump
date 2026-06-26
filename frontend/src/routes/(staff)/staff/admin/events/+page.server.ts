import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { EventService } from '$lib/server/services/events';
import { adminEventSchema } from '$lib/validation/events';
import { eventTypeLabel, minutesToHHMM } from '$lib/domain/event';
import {
  isEventModuleKey,
  type EventModuleKey,
} from '$lib/domain/eventModules';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { toDateKey } from '$lib/domain/planningTime';

export type AdminEventVM = {
  id: string;
  titre: string;
  publicName: string;
  /** What the dev space / talents see today: publicName or the SF titre. */
  displayName: string;
  eventType: string;
  eventTypeLabel: string;
  campusId: string;
  campusName: string;
  /** "12 fév. 2026 → 26 fév. 2026" (campus tz), endDate omitted when absent. */
  dateLabel: string;
  /** Epoch ms of the start date, for client-side sorting on the Dates column. */
  dateTs: number;
  /** Start day `YYYY-MM-DD` (campus tz): the end-date input's `min`. */
  startDateKey: string;
  schoolYearLabel: string;
  schoolYearStart: number;
  /** "HH:MM" Jump-owned start, or "" when unset (shows the type default). */
  startTime: string;
  /** End day `YYYY-MM-DD` (campus tz) for the form, or "" when unset. */
  endDate: string;
  notes: string;
  modules: EventModuleKey[];
  participations: number;
};

function dateRangeLabel(
  date: Date,
  endDate: Date | null,
  timezone: string,
): string {
  const fmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: timezone,
  });
  const start = fmt.format(date);
  if (!endDate) return start;
  const end = fmt.format(endDate);
  return start === end ? start : `${start} → ${end}`;
}

export const load: PageServerLoad = async () => {
  // Admins are cross-campus, so this reads the raw (unscoped) client: every
  // campus's events land here. The dev workspace, by contrast, only ever sees
  // its own campus via scopedPrisma.
  const rows = await prisma.event.findMany({
    orderBy: { date: 'desc' },
    select: {
      id: true,
      titre: true,
      publicName: true,
      date: true,
      endDate: true,
      startMinutes: true,
      eventType: true,
      notes: true,
      campusId: true,
      campus: { select: { name: true, timezone: true } },
      modules: { select: { moduleKey: true } },
      _count: { select: { participations: true } },
    },
  });

  const events: AdminEventVM[] = rows.map((e) => {
    const tz = e.campus.timezone;
    const sy = schoolYearOf(e.date, tz);
    return {
      id: e.id,
      titre: e.titre,
      publicName: e.publicName ?? '',
      displayName: e.publicName?.trim() || e.titre,
      eventType: e.eventType,
      eventTypeLabel: eventTypeLabel(e.eventType),
      campusId: e.campusId,
      campusName: e.campus.name,
      dateLabel: dateRangeLabel(e.date, e.endDate, tz),
      dateTs: e.date.getTime(),
      startDateKey: toDateKey(e.date, tz),
      schoolYearLabel: sy.label,
      schoolYearStart: sy.startYear,
      startTime: minutesToHHMM(e.startMinutes),
      endDate: e.endDate ? toDateKey(e.endDate, tz) : '',
      notes: e.notes ?? '',
      modules: e.modules.map((m) => m.moduleKey).filter(isEventModuleKey),
      participations: e._count.participations,
    };
  });

  const form = await superValidate(zod4(adminEventSchema));

  return { events, form };
};

export const actions: Actions = {
  update: async ({ request }) => {
    const form = await superValidate(request, zod4(adminEventSchema));
    if (!form.valid) return fail(400, { form });

    try {
      await EventService.updateEventConfig(form.data.id, {
        publicName: form.data.publicName,
        startTime: form.data.startTime,
        endDate: form.data.endDate,
        notes: form.data.notes,
        modules: form.data.modules,
      });
      return message(form, 'Événement mis à jour.');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
    }
  },
};
