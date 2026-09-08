import type { EventLifecycleStatus } from './eventLifecycle';

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
 *  - `shown`        activated AND >=1 section: live for the dev team. Mirrors
 *                   `resolveWorkspaceEvents`' membership rule, so this state and
 *                   the dev workspace agree on what "in the dev space" means.
 */
export type EventConfigState = 'shown' | 'ready' | 'unconfigured';

export const EVENT_CONFIG_STATE_LABELS: Record<EventConfigState, string> = {
  shown: 'Visible',
  ready: 'Prêt à publier',
  unconfigured: 'À configurer',
};

export const EVENT_CONFIG_STATE_HINTS: Record<EventConfigState, string> = {
  shown: "Activé et visible dans l'espace dev.",
  ready:
    "Configuré mais masqué : activez-le pour le rendre visible dans l'espace dev.",
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
 * What the two configuration rules below read off an event.
 *
 * Structural rather than `AdminEventVM`, so the rules stay in the domain: the
 * write path holds a Prisma row, the aggregates hold a view model, and both
 * answer the same question about the same five fields.
 */
export type EventConfigFields = {
  publicName: string | null;
  cohortNoun: string | null;
  endDate: string | null;
  modules: readonly unknown[];
  devActivated: boolean;
};

/** What an event can be missing, in staff wording. */
export const EVENT_MISSING_LABELS = {
  publicName: 'nom public',
  cohortNoun: 'nom des participants',
  endDate: 'date de fin',
  modules: 'aucune section activée',
  activation: "pas encore activé pour l'espace dev",
} as const;

/**
 * Everything not filled in yet on an event, in the order a human would fix it.
 *
 * Here rather than in the aggregates because it was written twice, character for
 * character, in `unconfiguredEvents.ts` and in `configuration.ts`'s event detail -
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
  if (!event.endDate) missing.push(EVENT_MISSING_LABELS.endDate);
  if (event.modules.length === 0) missing.push(EVENT_MISSING_LABELS.modules);
  else if (!event.devActivated) missing.push(EVENT_MISSING_LABELS.activation);
  return missing;
}

/**
 * Everything that can stop an activation, in the order a human would fix it.
 * A list rather than a bare union so a caller can iterate the rule - the seed's
 * reachability check proves each of the three has an example somewhere - and so
 * a fourth blocker is added in one place.
 */
export const ACTIVATION_BLOCKERS = [
  'publicName',
  'endDate',
  'modules',
] as const;

/** One thing that can stop an activation. See {@link activationBlockerKeys}. */
export type ActivationBlocker = (typeof ACTIVATION_BLOCKERS)[number];

/**
 * What stops this event from being made visible, empty when nothing does.
 *
 * A stricter rule than `configState`, and that gap is the bug this closes: an
 * event with sections but no end date is `ready` ("Prêt à publier", one toggle
 * from live) and the activation write refuses it. The rule lived only as a Prisma
 * `where` in `EventService.bulkSetActivation` and as a hand-copied predicate in
 * `adminApi/writes/bulk.ts`, so nothing that *reported* readiness could consult
 * it. Its Prisma twin is `activatableEventWhere` in `server/services/stageContext`.
 *
 * The cohort noun is deliberately absent: the write does not check it, so listing
 * it here would refuse an activation that actually succeeds.
 *
 * Keys rather than labels, because the same three facts are read aloud in two
 * registers: an inventory quotes them as nouns ("il manque : nom public"), and
 * the config dialog asks for them as instructions ("Renseigner un nom public").
 * A surface picking its own wording off a key still shares the rule, and the
 * union makes a fourth blocker a compile error there rather than a bullet
 * silently missing from the list.
 */
export function activationBlockerKeys(
  event: EventConfigFields,
): ActivationBlocker[] {
  const blockers: ActivationBlocker[] = [];
  if (!event.publicName) blockers.push('publicName');
  if (!event.endDate) blockers.push('endDate');
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
