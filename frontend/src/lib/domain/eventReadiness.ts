import type { Prisma } from '@prisma/client';
import type { EventLifecycleStatus } from './eventLifecycle';
import { visibleParticipationWhere } from './sfMemberStatus';
import { daysBetween } from './planningTime';

/**
 * The events anyone but an admin is shown: an admin activated it
 * (`devActivatedAt`) and it carries at least one section. Everything a talent,
 * a parent or the dev team reads about an event goes through this rule: the dev
 * workspace's list and pages, the « Déjà venu » count and a talent's fiche, the
 * talent's home, planning, activities, feedback and émargement, and the parent
 * space (#516). Only the admin space and the admin API read every event.
 *
 * Before #516 it decided only what the dev workspace listed, and every other
 * surface read the whole Salesforce history: talents and parents saw campaigns
 * nobody had prepared, under their raw Salesforce title, and a page of the
 * workspace opened by its address for an event the menu did not hold. An
 * activated event has passed the activation rule ({@link activationBlockers}),
 * so its public name is set, and that is what lets a talent surface name it.
 *
 * Two spellings of one rule, because a Prisma `where` cannot call a predicate:
 * this one for a query, {@link isEventShown} for a row already loaded. They are
 * kept beside each other and `eventReadiness.test.ts` asserts they read the
 * same fields. It is also the `shown` state of {@link eventConfigState}, which
 * reads the same two facts off a view model, and the same test holds the three
 * together.
 *
 * Not the same rule as `activatableEventWhere` in `server/services/events`:
 * this one is what IS shown, that one is what MAY be shown (a stricter set,
 * which also needs a public name).
 */
export const shownEventWhere = {
  devActivatedAt: { not: null },
  modules: { some: {} },
} satisfies Prisma.EventWhereInput;

/**
 * The enrolments a talent's own space and their parent's read: one the dev
 * space shows (`visibleParticipationWhere`, a withdrawn talent is not expected
 * anywhere), on an event an admin activated ({@link shownEventWhere}). Spread
 * into a `Participation` where; `event` narrows the events further and is
 * ANDed with the rule rather than spread over it, so a caller's own `modules`
 * or `OR` cannot replace a half of it.
 */
export function shownEnrolmentWhere(
  event?: Prisma.EventWhereInput,
): Prisma.ParticipationWhereInput {
  return {
    ...visibleParticipationWhere,
    event: event ? { AND: [shownEventWhere, event] } : shownEventWhere,
  };
}

/** What {@link shownEventWhere} reads off a row already loaded. */
type ShownEventFields = {
  devActivatedAt: Date | null;
  modules: readonly unknown[];
};

/**
 * Why a loaded event is not shown, as a key of {@link EVENT_MISSING_LABELS},
 * or null when it is. No section comes first, the order `eventMissingConfig`
 * gives: an event with none shows nothing whatever its gate says, so naming the
 * activation then would send the reader to flip a switch that changes nothing.
 * A key rather than a sentence, because a read describes it and a refused write
 * says what to do about it.
 */
export function eventNotShownBecause(
  event: ShownEventFields,
): 'modules' | 'activation' | null {
  if (event.modules.length === 0) return 'modules';
  if (event.devActivatedAt === null) return 'activation';
  return null;
}

/** {@link shownEventWhere} for a row already loaded. */
export function isEventShown(event: ShownEventFields): boolean {
  return eventNotShownBecause(event) === null;
}

/**
 * The configuration state of an event, for the admin events cockpit. A pure
 * projection of the two things the admin owns on the config screen - the
 * enabled modules and the visibility gate - recomputed, never stored (same
 * shape as the XP/level projection).
 *
 * It is deliberately date-INDEPENDENT: an event is "à configurer", "prêt à
 * publier" or "visible" by its config alone, not the calendar. The lifecycle
 * status (à venir / en cours / passé) is a separate axis; the two combine only
 * to decide what still needs *action* (see `isEventToPrepare`). This replaced a
 * multi-reason "à préparer" flag that folded in the (optional) start time and so
 * fired on nearly every non-past event - reading as "not finished" rather than
 * "needs work", which is exactly the noise this removes.
 *
 *  - `unconfigured` no section enabled (nothing to show, whatever the gate says)
 *  - `ready`        sections enabled but hidden - one toggle from live
 *  - `shown`        activated AND >=1 section: live for everyone but admins,
 *                   the dev team, the event's talents and their parents. The
 *                   view-model spelling of `shownEventWhere`, so this state
 *                   and every non-admin screen agree on what "shown" means.
 */
export type EventConfigState = 'shown' | 'ready' | 'unconfigured';

export const EVENT_CONFIG_STATE_LABELS: Record<EventConfigState, string> = {
  shown: 'Visible',
  ready: 'Prêt à publier',
  unconfigured: 'À configurer',
};

export const EVENT_CONFIG_STATE_HINTS: Record<EventConfigState, string> = {
  shown:
    "Activé : visible dans l'espace dev, et par ses talents et leurs parents.",
  ready:
    "Configuré mais masqué : activez-le pour le montrer à l'espace dev, à ses talents et à leurs parents.",
  unconfigured:
    "Aucune section activée : configurez l'événement pour le préparer.",
};

export function eventConfigState(input: {
  /** Admin has activated it (the visibility gate, `Event.devActivatedAt`). */
  devActivated: boolean;
  /** Number of enabled `EventConfig_Module` rows. */
  moduleCount: number;
}): EventConfigState {
  // No section = nothing to show, even if the gate is on: the dev space is only
  // per-module surfaces, so an activated-but-empty event still shows nothing.
  if (input.moduleCount === 0) return 'unconfigured';
  return input.devActivated ? 'shown' : 'ready';
}

/**
 * Does this event still need admin action before it's live for the dev team?
 * Not finished AND not yet shown (so: à configurer or prêt à publier). A past
 * event needs nothing - you don't prepare what's over - so it never counts,
 * which is what keeps the "À préparer" bucket logical instead of an "anything
 * not past" catch-all.
 */
export function isEventToPrepare(input: {
  status: EventLifecycleStatus;
  configState: EventConfigState;
}): boolean {
  return input.status !== 'past' && input.configState !== 'shown';
}

/**
 * How soon an event starts, for deciding which preparation is urgent.
 *
 * The list of events to prepare runs months ahead, so soonest-first alone puts
 * an event starting on Thursday beside one starting in spring, and a mail that
 * lists them alike teaches its reader that none is pressing. Three bands, by
 * calendar day in the campus's timezone, the same axis as the lifecycle status:
 *
 *  - `imminent` already under way, or starting within {@link IMMINENT_WITHIN_DAYS} days
 *  - `soon`     starting within {@link SOON_WITHIN_DAYS} days
 *  - `later`    starting after that
 *
 * A past event has no horizon (`null`): there is nothing left to prepare.
 */
export type PreparationHorizon = 'imminent' | 'soon' | 'later';

export const PREPARATION_HORIZONS = [
  'imminent',
  'soon',
  'later',
] as const satisfies readonly PreparationHorizon[];

/** A week: an event starting next Monday is still this week's preparation. */
export const IMMINENT_WITHIN_DAYS = 7;
/** Three weeks: enough lead time to name it, configure it and announce it. */
export const SOON_WITHIN_DAYS = 21;

/**
 * The band an event falls in. `startDay` and `today` are calendar days
 * (`YYYY-MM-DD`) in the event's campus timezone, so the caller that already
 * holds that timezone decides them once and this stays a rule about days.
 */
export function preparationHorizon(
  status: EventLifecycleStatus,
  startDay: string,
  today: string,
): PreparationHorizon | null {
  if (status === 'past') return null;
  if (status === 'ongoing') return 'imminent';
  const days = daysBetween(today, startDay);
  if (days <= IMMINENT_WITHIN_DAYS) return 'imminent';
  if (days <= SOON_WITHIN_DAYS) return 'soon';
  return 'later';
}

/**
 * What the two configuration rules below read off an event.
 *
 * Structural rather than `AdminEventVM`, so the rules stay in the domain: the
 * write path holds a Prisma row, the aggregates hold a view model, and both
 * answer the same question about the same four fields.
 *
 * The event's days are not among them: Salesforce owns both, an event always
 * has a start, and no end day is a single-day event rather than a missing
 * field. The end day used to be typed on the config screen and so counted as
 * configuration; once the sync wrote it, asking for it here refused every
 * single-day campaign and every visible event Salesforce gave no `EndDate`.
 */
export type EventConfigFields = {
  publicName: string | null;
  cohortNoun: string | null;
  modules: readonly unknown[];
  devActivated: boolean;
};

/** What an event can be missing, in staff wording. */
export const EVENT_MISSING_LABELS = {
  publicName: 'nom public',
  cohortNoun: 'nom des participants',
  modules: 'aucune section activée',
  activation: 'pas encore activé',
} as const;

/**
 * Everything not filled in yet on an event, in the order a human would fix it.
 *
 * Here rather than in the aggregates because it was written twice, character for
 * character, in the list of events to prepare and in `configuration.ts`'s event detail -
 * two answers a reader compares, so a label edited in one place would have read
 * as two different truths about the same event.
 *
 * Descriptive, never a membership rule: whether an event needs action is
 * {@link isEventToPrepare}, and what stops it from going live is
 * {@link activationBlockers}. A missing cohort noun appears here and blocks
 * nothing.
 */
export function eventMissingConfig(event: EventConfigFields): string[] {
  const missing: string[] = [];
  if (!event.publicName) missing.push(EVENT_MISSING_LABELS.publicName);
  if (!event.cohortNoun) missing.push(EVENT_MISSING_LABELS.cohortNoun);
  if (event.modules.length === 0) missing.push(EVENT_MISSING_LABELS.modules);
  else if (!event.devActivated) missing.push(EVENT_MISSING_LABELS.activation);
  return missing;
}

/**
 * Everything that can stop an activation, in the order a human would fix it.
 * A list rather than a bare union so a caller can iterate the rule - the seed's
 * reachability check proves each of them has an example somewhere - and so
 * a third blocker is added in one place.
 */
export const ACTIVATION_BLOCKERS = ['publicName', 'modules'] as const;

/** One thing that can stop an activation. See {@link activationBlockerKeys}. */
export type ActivationBlocker = (typeof ACTIVATION_BLOCKERS)[number];

/**
 * What stops this event from being made visible, empty when nothing does.
 *
 * A stricter rule than `configState`, and that gap is the bug this closes: an
 * event with sections but no public name is `ready` ("Prêt à publier", one
 * toggle from live) and the activation write refuses it. The rule lived only as a Prisma
 * `where` in the bulk activation and as a hand-copied predicate in
 * `adminApi/writes/bulk.ts`, so nothing that *reported* readiness could consult
 * it. Its Prisma twin is `activatableEventWhere` in `server/services/events`.
 *
 * The cohort noun is deliberately absent: the write does not check it, so listing
 * it here would refuse an activation that actually succeeds.
 *
 * Keys rather than labels, because the same facts are read aloud in two
 * registers: an inventory quotes them as nouns ("il manque : nom public"), and
 * the config dialog asks for them as instructions ("Renseigner un nom public").
 * A surface picking its own wording off a key still shares the rule, and the
 * union makes a third blocker a compile error there rather than a bullet
 * silently missing from the list.
 */
export function activationBlockerKeys(
  event: EventConfigFields,
): ActivationBlocker[] {
  const blockers: ActivationBlocker[] = [];
  if (!event.publicName) blockers.push('publicName');
  if (event.modules.length === 0) blockers.push('modules');
  return blockers;
}

/** The same rule in staff wording, which is what the admin API tier quotes. */
export function activationBlockers(event: EventConfigFields): string[] {
  return activationBlockerKeys(event).map((key) => EVENT_MISSING_LABELS[key]);
}

/**
 * The refusal a caller reads when it asks for an activation the rule above
 * refuses, or null when nothing stops it.
 *
 * The sentence lives here rather than at either call site because both
 * transports of the same refusal have to say the same thing: the admin API
 * hands it back as an `OperationRefusedError`, the config save as a 400 on the
 * dialog. What differs is the vocabulary of the failure, never its wording.
 */
export function activationRefusal(event: EventConfigFields): string | null {
  const blockers = activationBlockers(event);
  if (blockers.length === 0) return null;
  return `Cet événement ne peut pas encore être rendu visible, il lui manque : ${blockers.join(', ')}.`;
}

/** Whether activating this event would show anything. See {@link activationBlockers}. */
export function canBeMadeVisible(event: EventConfigFields): boolean {
  return activationBlockerKeys(event).length === 0;
}
