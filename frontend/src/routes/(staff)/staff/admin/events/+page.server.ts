import type { PageServerLoad, Actions } from './$types';
import { fail, isHttpError } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { EventService } from '$lib/server/services/events';
import { EventConfigTemplateService } from '$lib/server/services/eventConfigTemplates';
import {
  adminEventSchema,
  bulkEventModulesSchema,
  bulkEventActivationSchema,
  eventConfigTemplateSaveSchema,
} from '$lib/validation/events';
import { eventTypeLabel, minutesToHHMM } from '$lib/domain/event';
import {
  isEventModuleKey,
  parseModuleSettings,
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
  /** Per-module sub-options keyed by module key (only enabled modules carry one). */
  moduleSettings: Record<string, unknown>;
  /** Per-event feedback form override (id), or "" = use the type default. */
  feedbackFormId: string;
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
      feedbackFormId: true,
      campusId: true,
      campus: { select: { name: true, timezone: true } },
      modules: { select: { moduleKey: true, settings: true } },
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
    const present = e.modules.filter((m) => isEventModuleKey(m.moduleKey));
    const modules = present.map((m) => m.moduleKey as EventModuleKey);
    const moduleSettings: Record<string, unknown> = {};
    for (const m of present) {
      const key = m.moduleKey as EventModuleKey;
      moduleSettings[key] = parseModuleSettings(key, m.settings);
    }
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
      moduleSettings,
      feedbackFormId: e.feedbackFormId ?? '',
      participations: e._count.participations,
    };
  });

  // The feedback-form picker in the edit dialog: the published, talent-answerable
  // forms an event can be bound to, plus the title of the form that resolves by
  // default per event type (shown as the "Par défaut (…)" sentinel). One query
  // each, cross-event (the dialog reuses them for whichever row is opened).
  const [publishedForms, typeDefaults, templates] = await Promise.all([
    prisma.feedback_Form.findMany({
      // Any published, talent-answerable form is pickable for an event (forms are
      // not owned by events — an event-specific one is just a normally-named form).
      where: { status: 'published', allowsAuthenticatedAccess: true },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    }),
    prisma.feedback_Form.findMany({
      where: { defaultForEventType: { not: null } },
      select: { id: true, defaultForEventType: true, title: true },
    }),
    EventConfigTemplateService.list(),
  ]);
  const feedbackForms = publishedForms.map((f) => ({
    value: f.id,
    label: f.title,
  }));
  // The form an event type resolves to when it sets no override: its id (to deep-
  // link the editor) + title (for the "Par défaut (…)" picker label).
  const defaultFormByType: Record<string, { id: string; title: string }> = {};
  for (const f of typeDefaults) {
    if (f.defaultForEventType)
      defaultFormByType[f.defaultForEventType] = { id: f.id, title: f.title };
  }

  const form = await superValidate(zod4(adminEventSchema));

  return { events, form, feedbackForms, defaultFormByType, templates };
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
        moduleSettings: form.data.moduleSettings,
        devActivated: form.data.devActivated,
        feedbackFormId: form.data.feedbackFormId,
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

  // "Enregistrer comme modèle" from the config wizard: snapshot the posted module
  // config as a new global EventConfig_Template. Plain enhanced form — name +
  // description + a JSON `config` blob (modules + per-module settings + default
  // feedback form), since the config is nested.
  saveAsTemplate: async ({ request, locals }) => {
    const fd = await request.formData();
    let config: unknown;
    try {
      config = JSON.parse(String(fd.get('config') ?? '{}'));
    } catch {
      return fail(400, { templateError: 'Configuration invalide.' });
    }
    const parsed = eventConfigTemplateSaveSchema.safeParse({
      name: fd.get('name'),
      description: fd.get('description') ?? '',
      ...(config as Record<string, unknown>),
    });
    if (!parsed.success) {
      return fail(400, {
        templateError: parsed.error.issues[0]?.message ?? 'Modèle invalide.',
      });
    }
    try {
      const { id, updated } = await EventConfigTemplateService.saveTemplate({
        ...parsed.data,
        actorId: locals.staffProfile?.id ?? null,
      });
      return {
        templateId: id,
        templateName: parsed.data.name,
        templateUpdated: updated,
      };
    } catch (err) {
      if (isHttpError(err)) {
        return fail(err.status, { templateError: String(err.body.message) });
      }
      console.error(err);
      return fail(500, {
        templateError: "Erreur lors de l'enregistrement du modèle.",
      });
    }
  },

  // Delete a config template from the wizard's step 1. The list is managed
  // optimistically client-side, so this just removes the row server-side.
  deleteTemplate: async ({ request }) => {
    const fd = await request.formData();
    const id = String(fd.get('id') ?? '').trim();
    if (!id) return fail(400, { templateError: 'Modèle manquant.' });
    try {
      await EventConfigTemplateService.remove(id);
      return { ok: true };
    } catch (err) {
      console.error(err);
      return fail(500, { templateError: 'Erreur lors de la suppression.' });
    }
  },
};
