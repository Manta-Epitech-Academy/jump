import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { EventService } from '$lib/server/services/events';
import {
  adminEventSchema,
  bulkEventModulesSchema,
  bulkEventActivationSchema,
} from '$lib/validation/events';
import { eventTypeLabel, minutesToHHMM } from '$lib/domain/event';
import {
  isEventModuleKey,
  type EventModuleKey,
} from '$lib/domain/eventModules';
import {
  getLifecycleBounds,
  getEventStatus,
  type LifecycleBounds,
  type EventLifecycleStatus,
} from '$lib/domain/eventLifecycle';
import {
  eventPrepReasons,
  type EventPrepReason,
} from '$lib/domain/eventReadiness';
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
  /** Lifecycle bucket in the event's own campus tz: à venir / en cours / passé. */
  status: EventLifecycleStatus;
  /** Linked to a Salesforce campaign (`externalId`); false = admin-created. */
  synced: boolean;
  /** Admin has activated it: it shows in the dev workspace (gate, not modules). */
  devActivated: boolean;
  /**
   * Config gaps the admin can still close (start time, modules), for events
   * that haven't ended. Empty for past or fully-configured events. Drives the
   * "À préparer" cue + filter.
   */
  prepReasons: EventPrepReason[];
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
      externalId: true,
      devActivatedAt: true,
      campusId: true,
      campus: { select: { name: true, timezone: true } },
      modules: { select: { moduleKey: true } },
      _count: { select: { participations: true } },
    },
  });

  // Lifecycle bounds are timezone-dependent and the list is cross-campus, so
  // memoize one bounds object per distinct campus tz instead of recomputing it
  // for every row.
  const boundsByTz = new Map<string, LifecycleBounds>();
  const boundsFor = (tz: string): LifecycleBounds => {
    let b = boundsByTz.get(tz);
    if (!b) {
      b = getLifecycleBounds(tz);
      boundsByTz.set(tz, b);
    }
    return b;
  };

  const events: AdminEventVM[] = rows.map((e) => {
    const tz = e.campus.timezone;
    const sy = schoolYearOf(e.date, tz);
    const startDateKey = toDateKey(e.date, tz);
    const status = getEventStatus(
      { date: e.date, endDate: e.endDate },
      boundsFor(tz),
    );
    const modules = e.modules.map((m) => m.moduleKey).filter(isEventModuleKey);
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
      startDateKey,
      schoolYearLabel: sy.label,
      schoolYearStart: sy.startYear,
      startTime: minutesToHHMM(e.startMinutes),
      status,
      synced: e.externalId != null,
      devActivated: e.devActivatedAt != null,
      prepReasons: eventPrepReasons({
        status,
        devActivated: e.devActivatedAt != null,
        startTimeConfirmed: e.startMinutes != null,
        moduleCount: modules.length,
      }),
      endDate: e.endDate ? toDateKey(e.endDate, tz) : '',
      notes: e.notes ?? '',
      modules,
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
        devActivated: form.data.devActivated,
      });
      return message(form, 'Événement mis à jour.');
    } catch (err) {
      console.error(err);
      return message(form, 'Erreur lors de la mise à jour.', { status: 500 });
    }
  },

  // Bulk module edit over the list selection. Posted from a plain enhanced form
  // (not superform), so the payload is hand-parsed and validated here. `ids`
  // arrives comma-joined, `modules` as repeated fields.
  bulkModules: async ({ request }) => {
    const fd = await request.formData();
    const parsed = bulkEventModulesSchema.safeParse({
      ids: String(fd.get('ids') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      modules: fd.getAll('modules').map(String),
    });
    if (!parsed.success) {
      return fail(400, { bulkError: 'Sélection invalide.' });
    }

    try {
      await EventService.bulkSetModules(parsed.data.ids, parsed.data.modules);
      return { bulkCount: parsed.data.ids.length };
    } catch (err) {
      console.error(err);
      return fail(500, { bulkError: 'Erreur lors de la mise à jour groupée.' });
    }
  },

  // Bulk show/hide in the dev workspace over the selection. Same plain-form
  // parsing as bulkModules; `activate` arrives as "true"/"false".
  bulkActivation: async ({ request }) => {
    const fd = await request.formData();
    const parsed = bulkEventActivationSchema.safeParse({
      ids: String(fd.get('ids') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      activate: fd.get('activate') === 'true',
    });
    if (!parsed.success) {
      return fail(400, { bulkError: 'Sélection invalide.' });
    }

    try {
      await EventService.bulkSetActivation(
        parsed.data.ids,
        parsed.data.activate,
      );
      return { bulkCount: parsed.data.ids.length };
    } catch (err) {
      console.error(err);
      return fail(500, { bulkError: 'Erreur lors de la mise à jour groupée.' });
    }
  },
};
