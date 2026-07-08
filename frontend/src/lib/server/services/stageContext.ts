import { error } from '@sveltejs/kit';
import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import { EVENT_TYPES } from '$lib/domain/event';
import {
  type EventModuleKey,
  type EventModuleSettings,
  isEventModuleKey,
  parseModuleSettings,
} from '$lib/domain/eventModules';
import {
  type EventLifecycleStatus,
  type LifecycleBounds,
  getEventStatus,
  getLifecycleBounds,
} from '$lib/domain/eventLifecycle';
import { schoolYearOf, type SchoolYear } from '$lib/domain/schoolYear';
import { toDateKey } from '$lib/domain/planningTime';
import { prisma } from '$lib/server/db';
import type { Prisma } from '@prisma/client';

/**
 * An event is "visible dans l'espace dev" iff an admin activated it
 * (`devActivatedAt`) and it carries at least one module. Single source for the
 * dev workspace event list and any surface that must mirror that visibility
 * (the talent / staff attended-events history).
 */
export const devVisibleEventWhere = {
  devActivatedAt: { not: null },
  modules: { some: {} },
} satisfies Prisma.EventWhereInput;

const STAGE_DEFAULT_DURATION_DAYS = 14;
const MS_PER_DAY = 86_400_000;

/**
 * Whole days from `now` to `date`, clamped at 0 (a date today or in the past
 * reads "0", never negative). Calendar-day-naive by design: it rounds the raw
 * span up, matching `startsInDays` and the "J-X" countdown shown across the
 * dev workspace — not a timezone-aware day-boundary count. Single producer for
 * the `{{jours_restants}}` relance/broadcast variable so every surface agrees.
 */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY));
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export type EventRecord = {
  id: string;
  titre: string;
  /** Admin-set friendly name; falls back to `titre` for display. */
  publicName: string | null;
  date: Date;
  startMinutes: number | null;
  endDate: Date | null;
  eventType: string;
  /** Jump-owned cohort noun ("stagiaire", ...), or null when unnamed (the UI
   * falls back to the neutral default). See `cohortNounForms`. */
  cohortNoun: string | null;
  campusId: string;
  externalId: string | null;
  /** Per-event feedback form override; null = use the type default. */
  feedbackFormId: string | null;
  /** The dev-workspace surfaces this event exposes (presence = enabled). */
  modules: Set<EventModuleKey>;
  /**
   * Raw per-module sub-option Json, keyed by module key (only present modules).
   * Read it through `eventModuleSettings(event, key)` to get a typed, defaulted
   * object rather than touching the raw value.
   */
  moduleSettings: Map<EventModuleKey, unknown>;
};

/**
 * Typed, fully-defaulted sub-options for a module on this event. Returns the
 * module's defaults when the module is absent or carries no settings, so callers
 * never branch on presence - e.g. `eventModuleSettings(event, 'inscrits').showStatutColumn`.
 */
export function eventModuleSettings<K extends EventModuleKey>(
  event: { moduleSettings: Map<EventModuleKey, unknown> },
  key: K,
): EventModuleSettings[K] {
  return parseModuleSettings(key, event.moduleSettings.get(key));
}

export async function loadEventOr404(
  eventId: string,
  campusId: string,
): Promise<EventRecord> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      titre: true,
      publicName: true,
      date: true,
      startMinutes: true,
      endDate: true,
      eventType: true,
      cohortNoun: true,
      campusId: true,
      externalId: true,
      feedbackFormId: true,
      modules: { select: { moduleKey: true, settings: true } },
    },
  });
  if (!event || event.campusId !== campusId) {
    throw error(404, 'Événement introuvable.');
  }
  const { modules, ...rest } = event;
  const present = modules.filter((m) => isEventModuleKey(m.moduleKey));
  return {
    ...rest,
    modules: new Set(present.map((m) => m.moduleKey as EventModuleKey)),
    moduleSettings: new Map(
      present.map((m) => [m.moduleKey as EventModuleKey, m.settings]),
    ),
  };
}

/**
 * Gate a dev-workspace surface on a per-event module: throws 404 when the event
 * does not expose the module, so a direct URL to a surface the event has turned
 * off behaves like a missing page.
 */
export function requireEventModule(
  event: { modules: Set<EventModuleKey> },
  key: EventModuleKey,
): void {
  if (!event.modules.has(key)) {
    throw error(404, 'Fonctionnalité non disponible pour cet événement.');
  }
}

/**
 * Effective end of an event. An explicit `endDate` always wins. Otherwise only a
 * stage de seconde falls back to the default-duration window: a SF-synced stage
 * carries no endDate (only an applied planning template sets one) yet runs ~2
 * weeks. Every other type with no endDate is a single-day event - its start is
 * returned - so a one-afternoon coding club isn't treated as a two-week run.
 */
export function eventEndOrDefault(event: {
  date: Date;
  endDate: Date | null;
  eventType: string;
}): Date {
  if (event.endDate) return event.endDate;
  if (event.eventType === EVENT_TYPES.STAGE_SECONDE) {
    return addDays(event.date, STAGE_DEFAULT_DURATION_DAYS);
  }
  return event.date;
}

/**
 * Lifecycle status of an event, accounting for the stage default-duration
 * window. A stage de seconde synced from Salesforce carries no `endDate` yet
 * runs ~2 weeks, so feeding the raw row to `getEventStatus` would read `past`
 * the day after it starts; only a stage gets the synthesized window. Every other
 * type keeps its real (possibly null) `endDate` and uses the standard
 * single-day rule (a one-afternoon coding club is not "ongoing" for two weeks).
 * Single-sourced so the dev workspace and the admin events cockpit can't disagree
 * on whether a running stage is `ongoing`.
 */
export function resolveEventStatus(
  event: { date: Date; endDate: Date | null; eventType: string },
  bounds: LifecycleBounds,
): EventLifecycleStatus {
  const endDate =
    event.eventType === EVENT_TYPES.STAGE_SECONDE
      ? eventEndOrDefault(event)
      : event.endDate;
  return getEventStatus({ date: event.date, endDate }, bounds);
}

export type WorkspaceEventEntry = {
  id: string;
  titre: string;
  /** Admin-set friendly name; falls back to `titre` for display. */
  publicName: string | null;
  /** Salesforce Campaign id, for the switcher's deep-link. Null when unlinked. */
  externalId: string | null;
  date: Date;
  /**
   * Effective end: explicit endDate, else the stage default-duration window, else
   * (any other type) the start date (single-day). See `eventEndOrDefault`.
   */
  endDate: Date;
  status: EventLifecycleStatus;
  schoolYear: SchoolYear;
  /**
   * The event's year-month `YYYY-MM` in campus tz: the switcher's second
   * drill-down level. A real year-month (not a bare 1-12) so the two ends of a
   * school year that fall in the same calendar month (August bookends it) stay
   * distinct, and a plain string sort is already chronological within the year.
   */
  monthKey: string;
  /** Surfaces this event exposes: drive the sidebar nav for the current event. */
  modules: EventModuleKey[];
  /**
   * Whether the event has a schedule (≥1 time slot). Planning is not a module:
   * it's read-only data owned by pedago/admin, so its dev nav entry shows
   * data-driven - only when there is actually a schedule to look at.
   */
  hasPlanning: boolean;
  /**
   * Whether the event resolves to a LIVE feedback form (its override, else the
   * type default; published + talent-answerable). The Feedback (bilan) surface is
   * gated on this on top of the module, mirroring `hasPlanning`: enabling bilan
   * without a resolvable form would otherwise drop a dev on an empty page, so the
   * nav entry only shows when there is real feedback to look at.
   */
  hasFeedbackForm: boolean;
};

export type WorkspaceEvents = {
  /** All workspace events for the campus, most recent first. */
  events: WorkspaceEventEntry[];
  /** The event the workspace defaults to: ongoing > soonest upcoming > most recent past. */
  current: WorkspaceEventEntry | null;
};

/**
 * Every event that belongs to the dev cohort workspace for this (already
 * campus-scoped) client. Membership is two gates, both required:
 *  - `devActivatedAt`: an admin has validated the event for the dev cohort (an
 *    event is configured at creation but stays hidden until then), AND
 *  - at least one enabled module: the dev space is nothing but per-module
 *    surfaces, so an event exposing zero of them has nowhere to land. Including
 *    it would seat it in the switcher and let it become `current`, then drop on
 *    the empty state (`firstReachableSurface` -> null). Excluding it keeps the
 *    landing's happy path: a `current` with a reachable surface lands on it.
 *    (A member whose only surfaces are gated off by data, e.g. bilan without a
 *    form, still resolves to null and shows the empty state rather than a 404.)
 * Modules then decide WHICH surfaces a member event exposes. The workspace hosts
 * as many events as a campus activates, across school years, switchable in the
 * sidebar.
 */
export async function resolveWorkspaceEvents(
  db: ScopedPrismaClient,
  timezone: string,
): Promise<WorkspaceEvents> {
  // The events, plus the live feedback forms, resolved in one wave. A form is
  // "live" = published AND talent-answerable, the exact gate
  // `resolvePublishedEventForm` applies, so the bilan nav entry (gated on
  // `hasFeedbackForm` below) and the bilan page never disagree on whether there
  // is a form. Forms are global (not campus-scoped), so they come off `prisma`.
  const [rows, liveForms] = await Promise.all([
    db.event.findMany({
      where: devVisibleEventWhere,
      select: {
        id: true,
        titre: true,
        publicName: true,
        externalId: true,
        date: true,
        endDate: true,
        eventType: true,
        feedbackFormId: true,
        modules: { select: { moduleKey: true } },
        planning: { select: { _count: { select: { timeSlots: true } } } },
      },
      orderBy: { date: 'desc' },
    }),
    prisma.feedback_Form.findMany({
      where: { status: 'published', allowsAuthenticatedAccess: true },
      select: { id: true, defaultForEventType: true },
    }),
  ]);
  const liveFormIds = new Set(liveForms.map((f) => f.id));
  const liveDefaultTypes = new Set(
    liveForms
      .map((f) => f.defaultForEventType)
      .filter((t): t is string => t != null),
  );
  // Mirrors `eventFormWhere`/`resolveEventForm`: an explicit override is used
  // alone (never falling back to the type default), else the type default. So a
  // dangling override (form unpublished after it was picked) reads as "no form",
  // exactly as the page would resolve it.
  const eventResolvesLiveForm = (e: {
    feedbackFormId: string | null;
    eventType: string;
  }) =>
    e.feedbackFormId
      ? liveFormIds.has(e.feedbackFormId)
      : liveDefaultTypes.has(e.eventType);
  const bounds = getLifecycleBounds(timezone);
  const events: WorkspaceEventEntry[] = rows.map((e) => {
    return {
      id: e.id,
      titre: e.titre,
      publicName: e.publicName,
      externalId: e.externalId,
      date: e.date,
      // Effective end for display: the stage default-duration window, else the
      // real (possibly null) endDate. `resolveEventStatus` applies the same rule
      // for the lifecycle bucket, so the two never disagree.
      endDate: eventEndOrDefault(e),
      status: resolveEventStatus(e, bounds),
      schoolYear: schoolYearOf(e.date, timezone),
      monthKey: toDateKey(e.date, timezone).slice(0, 7),
      modules: e.modules.map((m) => m.moduleKey).filter(isEventModuleKey),
      hasPlanning: (e.planning?._count.timeSlots ?? 0) > 0,
      hasFeedbackForm: eventResolvesLiveForm(e),
    };
  });

  const byDateAsc = (a: WorkspaceEventEntry, b: WorkspaceEventEntry) =>
    a.date.getTime() - b.date.getTime();
  const ongoing = events
    .filter((e) => e.status === 'ongoing')
    .sort(byDateAsc)[0];
  const upcoming = events
    .filter((e) => e.status === 'upcoming')
    .sort(byDateAsc)[0];
  // `events` is date-desc, so the first past entry is the most recent one.
  const past = events.find((e) => e.status === 'past');
  const current = ongoing ?? upcoming ?? past ?? null;

  return { events, current };
}
