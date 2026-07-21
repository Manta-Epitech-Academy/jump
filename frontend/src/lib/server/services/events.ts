import { error } from '@sveltejs/kit';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { hhmmToMinutes, minutesToHHMM } from '$lib/domain/event';
import {
  isEventModuleKey,
  parseModuleSettings,
  type EventModuleKey,
} from '$lib/domain/eventModules';
import { fromWallClock, toDateKey } from '$lib/domain/planningTime';
import {
  getLifecycleBounds,
  type LifecycleBounds,
  type EventLifecycleStatus,
} from '$lib/domain/eventLifecycle';
import { resolveEventStatus } from './stageContext';
import {
  eventConfigState,
  type EventConfigState,
} from '$lib/domain/eventReadiness';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';

/**
 * The per-event view model the admin surfaces consume: the events cockpit
 * (`/staff/admin/events`) and the admin dashboard's "recently created" feed.
 * Both read the same shape so their badges, statuses and readiness can't drift
 * apart - the cockpit is the authoritative renderer, the dashboard a 5-row
 * preview of it. Built by `EventService.listAdminEvents`.
 */
export type AdminEventVM = {
  id: string;
  titre: string;
  publicName: string;
  /** What the dev space / talents see today: publicName or the SF titre. */
  displayName: string;
  /** Jump-owned cohort noun ("stagiaire", ...), or null when unnamed; set in the wizard. */
  cohortNoun: string | null;
  campusId: string;
  campusName: string;
  /** "12 fév. 2026 → 26 fév. 2026" (campus tz), endDate omitted when absent. */
  dateLabel: string;
  /** Epoch ms of the start date, for client-side sorting on the Dates column. */
  dateTs: number;
  /** Epoch ms of row creation, for the dashboard's "recently created" order. */
  createdTs: number;
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
  /**
   * Raw activation gate (`devActivatedAt`): the admin has claimed the event for
   * the dev cohort. This alone does NOT make it visible - that also needs >=1
   * module, at which point `configState` becomes `shown`. Drives the wizard's
   * visibility toggle (the page reads the state through `configState`).
   */
  devActivated: boolean;
  /**
   * The event's configuration state (à configurer / prêt à publier / visible),
   * a pure projection of (modules, activation). Single source for the admin
   * "État" badge and the "À préparer" cue + filter. `shown` mirrors
   * `resolveWorkspaceEvents`' membership rule, so the admin and the dev space
   * agree on what "in the dev space" means.
   */
  configState: EventConfigState;
  /** End day `YYYY-MM-DD` (campus tz) for the form, or "" when unset. */
  endDate: string;
  modules: EventModuleKey[];
  /** Per-module sub-options keyed by module key (only enabled modules carry one). */
  moduleSettings: Record<string, unknown>;
  /** Per-event feedback form override (id), or "" = use the type default. */
  feedbackFormId: string;
  participations: number;
};

// Cross-campus: admins see every campus. The dev workspace, by contrast, only
// ever reads its own campus via scopedPrisma.
const ADMIN_EVENT_SELECT = {
  id: true,
  titre: true,
  publicName: true,
  cohortNoun: true,
  date: true,
  endDate: true,
  startMinutes: true,
  externalId: true,
  devActivatedAt: true,
  feedbackFormId: true,
  campusId: true,
  createdAt: true,
  campus: { select: { name: true, timezone: true } },
  modules: { select: { moduleKey: true, settings: true } },
  _count: {
    select: {
      participations: { where: visibleParticipationWhere },
    },
  },
} satisfies Prisma.EventSelect;

type AdminEventRow = Prisma.EventGetPayload<{
  select: typeof ADMIN_EVENT_SELECT;
}>;

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

function buildAdminEventVMs(rows: AdminEventRow[]): AdminEventVM[] {
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

  return rows.map((e) => {
    const tz = e.campus.timezone;
    const sy = schoolYearOf(e.date, tz);
    const startDateKey = toDateKey(e.date, tz);
    // Same window rule as the dev workspace (see `resolveEventStatus`): the
    // explicit endDate (else the single-day start) decides the bucket, so the
    // cockpit and the dev space agree.
    const status = resolveEventStatus(e, boundsFor(tz));
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
      cohortNoun: e.cohortNoun,
      campusId: e.campusId,
      campusName: e.campus.name,
      dateLabel: dateRangeLabel(e.date, e.endDate, tz),
      dateTs: e.date.getTime(),
      createdTs: e.createdAt.getTime(),
      startDateKey,
      schoolYearLabel: sy.label,
      schoolYearStart: sy.startYear,
      startTime: minutesToHHMM(e.startMinutes),
      status,
      synced: e.externalId != null,
      devActivated: e.devActivatedAt != null,
      configState: eventConfigState({
        devActivated: e.devActivatedAt != null,
        moduleCount: modules.length,
      }),
      endDate: e.endDate ? toDateKey(e.endDate, tz) : '',
      modules,
      moduleSettings,
      feedbackFormId: e.feedbackFormId ?? '',
      participations: e._count.participations,
    };
  });
}

/**
 * Reconciles ONE event's `EventConfig_Module` rows to the desired set inside an
 * open transaction: deletes the modules dropped from the set, then UPSERTs each
 * desired module with its validated per-module sub-options (update preserves
 * `createdAt`). The single-event wizard save is the authoritative sub-option
 * editor, so it always (re)writes settings. The bulk list edit is a different
 * shape - presence only, across many events - and takes the set-based path in
 * `bulkSetModules` instead of looping this.
 *
 * Race-safe on the PK: the upsert means two admins saving the same event no
 * longer hit a P2002 that rolls the save back.
 */
async function applyModuleDiff(
  tx: Prisma.TransactionClient,
  eventId: string,
  moduleKeys: string[],
  settings: Record<string, unknown>,
) {
  const desired = [
    ...new Set(moduleKeys.filter(isEventModuleKey)),
  ] as EventModuleKey[];
  const current = await tx.eventConfig_Module.findMany({
    where: { eventId },
    select: { moduleKey: true },
  });
  const toRemove = current
    .map((m) => m.moduleKey)
    .filter((k) => !desired.includes(k as EventModuleKey));
  if (toRemove.length > 0) {
    await tx.eventConfig_Module.deleteMany({
      where: { eventId, moduleKey: { in: toRemove } },
    });
  }

  for (const moduleKey of desired) {
    const value = parseModuleSettings(
      moduleKey,
      settings[moduleKey],
    ) as Prisma.InputJsonValue;
    await tx.eventConfig_Module.upsert({
      where: { eventId_moduleKey: { eventId, moduleKey } },
      create: { eventId, moduleKey, settings: value },
      update: { settings: value },
    });
  }
}

export const EventService = {
  /**
   * Every event as an `AdminEventVM`, newest start date first, cross-campus.
   * Powers the events cockpit (full list) and the admin dashboard (which slices
   * the most recently created off this same list and counts the "à préparer"
   * bucket), so both read one source of truth for status + readiness.
   */
  async listAdminEvents(): Promise<AdminEventVM[]> {
    const rows = await prisma.event.findMany({
      orderBy: { date: 'desc' },
      select: ADMIN_EVENT_SELECT,
    });
    return buildAdminEventVMs(rows);
  },

  /**
   * Admin event configuration: the friendly `publicName`, the Jump-owned start
   * time-of-day and end date, and the dev-workspace surfaces the event exposes,
   * all in one transaction. Admin-only (the
   * `/staff/admin/events` page is admin-gated and admins are cross-campus, so
   * there is no campus check here; the event id is the authority). The start
   * `date` and `titre` stay Salesforce-owned. `endDate` is NOT sent by
   * Salesforce, so Jump owns it here (like the start time): a `YYYY-MM-DD`
   * campus-tz day, stored at end-of-day so the last day still reads as
   * "ongoing"; empty clears it back to a single-day event. Note an applied
   * planning template also rewrites `endDate` (its last day wins).
   */
  async updateEventConfig(
    eventId: string,
    data: {
      publicName: string;
      cohortNoun: string;
      startTime: string;
      endDate: string;
      modules: string[];
      moduleSettings: Record<string, unknown>;
      devActivated: boolean;
      feedbackFormId: string;
    },
  ) {
    // Surfaces a clean 404 (rather than a transaction-level throw) if the event
    // vanished between the page load and the save. The campus tz turns the
    // bare end-date day into a correct instant; `devActivatedAt` is read to
    // preserve the original activation instant across edits that keep it on.
    const event = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        devActivatedAt: true,
        campus: { select: { timezone: true } },
      },
    });
    // 23:59 campus-local on the chosen day: `getEventStatus` only flips the
    // event to "past" once that whole day has elapsed, and `toDateKey` still
    // resolves it to that day for the émargement créneaux.
    const endDate = data.endDate
      ? fromWallClock(data.endDate, '23:59', event.campus.timezone)
      : null;
    // Keep the existing instant while it stays activated; stamp now on a fresh
    // activation; clear it when deactivated.
    const devActivatedAt = data.devActivated
      ? (event.devActivatedAt ?? new Date())
      : null;
    // The feedback form the event's bilan surface uses. Empty clears the
    // override (fall back to the form marked default for the type); a non-empty
    // id is validated to point at a real form (publication is enforced later, at
    // resolve time). Checked outside the transaction so a bad id 400s cleanly.
    const feedbackFormId = data.feedbackFormId.trim() || null;
    if (feedbackFormId) {
      const form = await prisma.feedback_Form.findUnique({
        where: { id: feedbackFormId },
        select: { id: true },
      });
      if (!form) throw error(400, 'Formulaire de feedback introuvable.');
    }

    await prisma.$transaction(async (tx) => {
      await applyModuleDiff(tx, eventId, data.modules, data.moduleSettings);
      await tx.event.update({
        where: { id: eventId },
        data: {
          publicName: data.publicName.trim() || null,
          // Blank → NULL ("not named yet"); the UI falls back to the neutral
          // default, so the column never asserts an unmade choice.
          cohortNoun: data.cohortNoun.trim() || null,
          startMinutes: hhmmToMinutes(data.startTime),
          endDate,
          devActivatedAt,
          feedbackFormId,
        },
      });
    });
  },

  /**
   * Makes many events expose exactly the given module set at once (admin list
   * bulk edit). Set-based, NOT a per-event diff: two statements regardless of the
   * selection size - one `deleteMany` to drop every module outside the target
   * set across all selected events, one `createMany` (skipDuplicates) to add the
   * target modules to those that lack them. A per-event read-modify-write loop
   * here meant ~2 round-trips per event inside one interactive transaction (268
   * events ≈ 536 serial queries, leaning on the bumped 15s tx timeout); the set
   * form is O(1) in queries.
   *
   * `skipDuplicates` is what preserves per-event sub-options: an event that
   * already has a target module keeps its row (and its `settings`) untouched, so
   * a bulk apply never resets a campus's tuned settings - only presence changes.
   * Wrapped in a transaction so a failed insert rolls the deletes back. Admin-
   * only and cross-campus like `updateEventConfig`: the ids are the authority.
   */
  async bulkSetModules(eventIds: string[], modules: string[]) {
    if (eventIds.length === 0) return;
    const desired = [
      ...new Set(modules.filter(isEventModuleKey)),
    ] as EventModuleKey[];
    // Default sub-options per target module: the same value the per-event add
    // path used, computed once instead of per (event × module) pair.
    const defaults = new Map<EventModuleKey, Prisma.InputJsonValue>(
      desired.map((key) => [
        key,
        parseModuleSettings(key, undefined) as Prisma.InputJsonValue,
      ]),
    );
    await prisma.$transaction(async (tx) => {
      await tx.eventConfig_Module.deleteMany({
        where: {
          eventId: { in: eventIds },
          // Empty target set = expose nothing: drop every module (no key filter).
          ...(desired.length ? { moduleKey: { notIn: desired } } : {}),
        },
      });
      if (desired.length === 0) return;
      await tx.eventConfig_Module.createMany({
        data: eventIds.flatMap((eventId) =>
          desired.map((moduleKey) => ({
            eventId,
            moduleKey,
            settings: defaults.get(moduleKey),
          })),
        ),
        skipDuplicates: true,
      });
    });
  },

  /**
   * Shows or hides many events in the dev workspace at once (the `devActivatedAt`
   * gate). Admin-only, cross-campus: the ids are the authority. On activate only
   * the not-yet-activated rows are stamped, so an already-activated event keeps
   * its original instant; deactivate clears them all.
   *
   * Activation skips events that expose no module: flipping their gate would
   * surface nothing (no "Espace dev" badge, absent from the dev switcher - same
   * rule as `resolveWorkspaceEvents`), so a bulk activate that appeared to work
   * would silently be a no-op for them. We report how many were skipped instead.
   * Returns `activated` = events now effectively shown (eligible, ≥1 module) and
   * `skipped` = section-less events left untouched.
   */
  async bulkSetActivation(
    eventIds: string[],
    activate: boolean,
  ): Promise<{ activated: number; skipped: number }> {
    if (eventIds.length === 0) return { activated: 0, skipped: 0 };
    if (!activate) {
      await prisma.event.updateMany({
        where: { id: { in: eventIds } },
        data: { devActivatedAt: null },
      });
      return { activated: eventIds.length, skipped: 0 };
    }
    const eligible = await prisma.event.findMany({
      where: {
        id: { in: eventIds },
        modules: { some: {} },
        endDate: { not: null },
        NOT: [{ publicName: null }, { publicName: '' }],
      },
      select: { id: true },
    });
    const eligibleIds = eligible.map((e) => e.id);
    if (eligibleIds.length > 0) {
      await prisma.event.updateMany({
        where: { id: { in: eligibleIds }, devActivatedAt: null },
        data: { devActivatedAt: new Date() },
      });
    }
    return {
      activated: eligibleIds.length,
      skipped: eventIds.length - eligibleIds.length,
    };
  },
};
