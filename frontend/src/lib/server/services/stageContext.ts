import { error } from '@sveltejs/kit';
import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import { eventWindowEnd } from '$lib/domain/event';
import {
  type EventModuleKey,
  type EventModuleSettings,
  isEventModuleKey,
  parseModuleSettings,
} from '$lib/domain/eventModules';
import {
  type EventLifecycleStatus,
  getEventStatus,
  getLifecycleBounds,
} from '$lib/domain/eventLifecycle';
import { defaultEvent } from '$lib/domain/devWorkspace';
import { schoolYearOf, type SchoolYear } from '$lib/domain/schoolYear';
import { toDateKey } from '$lib/domain/planningTime';
import { prisma } from '$lib/server/db';
import type { Prisma } from '@prisma/client';

/**
 * An event is "visible dans l'espace dev" iff an admin activated it
 * (`devActivatedAt`) and it carries at least one module. Single source for the
 * dev workspace event list and for any surface that must mirror that
 * visibility: the talent's own attended-events history, and every link INTO the
 * workspace (see `isDevVisibleEvent` below).
 *
 * It is deliberately NOT what decides which rows a history LISTS. The talent
 * portal's list can afford the filter because it is built off `EventPresence`,
 * which only exists where the dev space ran the émargement, so nothing is lost;
 * the staff fiche's "Son parcours" is built off `Participation`, which is the
 * whole Salesforce history, and filtering it would answer "what does the dev
 * workspace expose" on a page whose question is "what has this person done with
 * us". So a row stays and its link is withheld.
 *
 * Not the same rule as `activatableEventWhere` in `services/events`: this one is
 * what IS visible, that one is what MAY be made visible (a stricter set, which
 * also needs a public name and an end date).
 */
export const devVisibleEventWhere = {
  devActivatedAt: { not: null },
  modules: { some: {} },
} satisfies Prisma.EventWhereInput;

/**
 * The same rule as `devVisibleEventWhere`, for a row already loaded rather than
 * for a query. Kept beside it so the two halves cannot drift: a surface that
 * links INTO the workspace has to apply the membership test the workspace
 * itself applies, and it has the event in hand rather than a `where` to extend.
 *
 * Withholding a link is not cosmetic here. The dev layout resolves the event in
 * view out of `resolveWorkspaceEvents` and falls back to the workspace default
 * when the URL names an event that is not a member, so a link to a
 * non-activated event opens its page under ANOTHER event's sidebar and
 * switcher: a cohort read under the wrong heading, which is worse than the 404
 * `loadEventOr404` does not throw (it gates on campus, never on activation).
 */
export function isDevVisibleEvent(event: {
  devActivatedAt: Date | null;
  modules: unknown[];
}): boolean {
  return event.devActivatedAt !== null && event.modules.length > 0;
}

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

export type EventRecord = {
  id: string;
  titre: string;
  /** Admin-set friendly name; falls back to `titre` for display. */
  publicName: string | null;
  date: Date;
  startMinutes: number | null;
  endDate: Date | null;
  /** Jump-owned cohort noun ("stagiaire", ...), or null when unnamed (the UI
   * falls back to the neutral default). See `cohortNounForms`. */
  cohortNoun: string | null;
  campusId: string;
  externalId: string | null;
  /** Per-event feedback form; null = no feedback form on this event. */
  feedbackFormId: string | null;
  /**
   * Which certificate this event issues, from the `Diploma_Template` catalogue.
   * Null = it issues none, which is what hides the Inscrits export. Resolve it
   * through `server/diplomaTemplates.ts` rather than querying it here.
   */
  diplomaTemplateId: string | null;
  /**
   * Which closing grid this event's 1:1s use, from the `Closing_Template`
   * catalogue. Null = it holds no closings, which is what hides the surface.
   * Resolve it through `server/closingTemplates.ts` rather than querying here.
   */
  closingTemplateId: string | null;
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
      cohortNoun: true,
      campusId: true,
      externalId: true,
      feedbackFormId: true,
      diplomaTemplateId: true,
      closingTemplateId: true,
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
 * Effective end of an event for DISPLAY: its explicit `endDate`, else the start
 * `date` (single-day). A multi-day event carries an explicit `endDate` (config
 * wizard or planning template); nothing is synthesised from a type. Thin
 * server-side alias of the domain `eventWindowEnd`, kept for the object-shaped
 * call sites here.
 *
 * NOT for lifecycle status: collapsing a null `endDate` to `date` makes a
 * single-day event read `past` the instant its start passes. Feed the raw
 * (nullable) `endDate` straight to `getEventStatus` instead, which treats a null
 * `endDate` as a whole-day window.
 */
export function eventEndOrDefault(event: {
  date: Date;
  endDate: Date | null;
}): Date {
  return eventWindowEnd(event.date, event.endDate);
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
   * Effective end: explicit endDate, else the start date (single-day). See
   * `eventEndOrDefault`.
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
   * Whether the event resolves to a LIVE feedback form (its `feedbackFormId`,
   * published + talent-answerable). The Feedback (bilan) surface is gated on this
   * on top of the module, mirroring `hasPlanning`: enabling bilan without a
   * resolvable form would otherwise drop a dev on an empty page, so the nav entry
   * only shows when there is real feedback to look at.
   */
  hasFeedbackForm: boolean;
  /**
   * Whether the event names a closing grid (`closingTemplateId`). The Closings
   * surface is gated on this on top of its module, exactly as bilan is gated on
   * its form: a grid-less closings module has no questions to ask, so the nav
   * entry would lead to a 404. Cheaper than the bilan's gate, which also has to
   * check the form is published - a grid is reachable as soon as it is named.
   */
  hasClosingTemplate: boolean;
};

export type WorkspaceEvents = {
  /** All workspace events for the campus, most recent first. */
  events: WorkspaceEventEntry[];
  /** The event the workspace defaults to. Rule and rationale: `defaultEvent`. */
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
 *    the empty state (`landingSurface` -> null). Excluding it keeps the
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
        feedbackFormId: true,
        closingTemplateId: true,
        modules: { select: { moduleKey: true } },
        _count: { select: { planningSlots: true } },
      },
      orderBy: { date: 'desc' },
    }),
    prisma.feedback_Form.findMany({
      where: { status: 'published', allowsAuthenticatedAccess: true },
      select: { id: true },
    }),
  ]);
  const liveFormIds = new Set(liveForms.map((f) => f.id));
  // Mirrors `eventFormWhere`/`resolveEventForm`: the event resolves a form iff its
  // `feedbackFormId` points at a live one. A dangling reference (form unpublished
  // after it was picked) reads as "no form", exactly as the page would resolve it.
  const eventResolvesLiveForm = (e: { feedbackFormId: string | null }) =>
    e.feedbackFormId ? liveFormIds.has(e.feedbackFormId) : false;
  const bounds = getLifecycleBounds(timezone);
  const events: WorkspaceEventEntry[] = rows.map((e) => {
    return {
      id: e.id,
      titre: e.titre,
      publicName: e.publicName,
      externalId: e.externalId,
      date: e.date,
      // Effective end for display: explicit endDate, else the single-day start.
      endDate: eventEndOrDefault(e),
      // Lifecycle bucket from the raw (nullable) endDate: a single-day event is
      // "ongoing" for its whole day, a multi-day one until its endDate.
      status: getEventStatus(e, bounds),
      schoolYear: schoolYearOf(e.date, timezone),
      monthKey: toDateKey(e.date, timezone).slice(0, 7),
      modules: e.modules.map((m) => m.moduleKey).filter(isEventModuleKey),
      hasPlanning: e._count.planningSlots > 0,
      hasFeedbackForm: eventResolvesLiveForm(e),
      hasClosingTemplate: e.closingTemplateId !== null,
    };
  });

  return { events, current: defaultEvent(events) };
}
