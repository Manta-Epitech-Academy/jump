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
