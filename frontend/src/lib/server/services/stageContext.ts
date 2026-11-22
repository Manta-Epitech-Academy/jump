import { error } from '@sveltejs/kit';
import type { ScopedPrismaClient } from '#lib/server/db/scoped.ts';
import { eventWindowEnd } from '#lib/domain/event.ts';
import {
  type EventModuleKey,
  type EventModuleSettings,
  type EventSurfaceKey,
  isEventModuleKey,
  parseModuleSettings,
} from '#lib/domain/eventModules.ts';
import {
  type EventLifecycleStatus,
  getEventStatus,
  getLifecycleBounds,
} from '#lib/domain/eventLifecycle.ts';
import { defaultEvent } from '#lib/domain/devWorkspace.ts';
import { schoolYearOf, type SchoolYear } from '#lib/domain/schoolYear.ts';
import { prisma } from '#lib/server/db.ts';
import { shownEventWhere } from '#lib/domain/eventReadiness.ts';

const MS_PER_DAY = 86_400_000;

/**
 * Whole days from `now` to `date`, clamped at 0 (a date today or in the past
 * reads "0", never negative). Calendar-day-naive by design: it rounds the raw
 * span up, matching `startsInDays` and the "J-X" countdown shown across the
 * dev workspace, not a timezone-aware day-boundary count. Single producer for
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

/**
 * Load an event of the caller's campus for one dev-workspace surface, 404ing
 * when it belongs to another campus, when no admin activated it
 * (`shownEventWhere`), or when `surface` is a module the event has turned off,
 * so a direct URL to such a surface behaves like a missing page. A surface that
 * is no module (`planning`) is gated on the data its own load reads, as are the
 * data gates of module surfaces (a feedback form, a closing grid, a certificate
 * design).
 *
 * The surface is a required argument because the module gate used to be a
 * second call each route had to remember, and four endpoints (both exports,
 * both émargement QR codes) forgot it. The activation gate is here for the same
 * reason: the workspace's menu only ever held activated events, but every page
 * under an event opened by its address for one it did not (#516), under
 * another event's name in the menu, since the layout falls back to the
 * workspace's default event when the URL names one it does not hold.
 */
export async function loadEventOr404(
  eventId: string,
  campusId: string,
  surface: EventSurfaceKey,
): Promise<EventRecord> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, campusId, ...shownEventWhere },
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
  if (!event) throw error(404, 'Événement introuvable.');
  const { modules, ...rest } = event;
  const present = modules.filter((m) => isEventModuleKey(m.moduleKey));
  const record: EventRecord = {
    ...rest,
    modules: new Set(present.map((m) => m.moduleKey as EventModuleKey)),
    moduleSettings: new Map(
      present.map((m) => [m.moduleKey as EventModuleKey, m.settings]),
    ),
  };
  if (isEventModuleKey(surface) && !record.modules.has(surface)) {
    throw error(404, 'Fonctionnalité non disponible pour cet événement.');
  }
  return record;
}

/**
 * Effective end of an event for DISPLAY: its explicit `endDate`, else the start
 * `date` (single-day). A multi-day event carries an explicit `endDate`, the
 * campaign's `EndDate` in Salesforce; nothing is synthesised from a type. Thin
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
  date: Date;
  /**
   * Effective end: explicit endDate, else the start date (single-day). See
   * `eventEndOrDefault`.
   */
  endDate: Date;
  status: EventLifecycleStatus;
  schoolYear: SchoolYear;
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
 * campus-scoped) client: the events an admin activated (`shownEventWhere`). Each one opens on its home,
 * which every event has; modules then decide WHICH other surfaces it exposes. The workspace hosts
 * as many events as a campus activates, across school years, each opened from
 * the campus calendar.
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
      where: shownEventWhere,
      select: {
        id: true,
        titre: true,
        publicName: true,
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
      date: e.date,
      // Effective end for display: explicit endDate, else the single-day start.
      endDate: eventEndOrDefault(e),
      // Lifecycle bucket from the raw (nullable) endDate: a single-day event is
      // "ongoing" for its whole day, a multi-day one until its endDate.
      status: getEventStatus(e, bounds),
      schoolYear: schoolYearOf(e.date, timezone),
      modules: e.modules.map((m) => m.moduleKey).filter(isEventModuleKey),
      hasPlanning: e._count.planningSlots > 0,
      hasFeedbackForm: eventResolvesLiveForm(e),
      hasClosingTemplate: e.closingTemplateId !== null,
    };
  });

  return { events, current: defaultEvent(events) };
}
