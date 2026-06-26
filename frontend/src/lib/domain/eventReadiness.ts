import type { EventLifecycleStatus } from './eventLifecycle';

/**
 * Config gaps an admin can still close on the event-config page, for an event
 * that hasn't ended yet. These are surfaced as the "À préparer" cue + filter on
 * the admin events list: a read-only projection (like the XP/level pattern),
 * recomputed from the event's own fields, never stored.
 *
 * Scope is deliberately the *config* the admin owns here (start time, modules),
 * NOT recruitment outcomes like "0 inscrit" - that's a KPI, not something this
 * screen fixes, so flagging it as "à préparer" would be noise at the wrong desk.
 */
export type EventPrepReason = 'activation' | 'time' | 'modules';

export const EVENT_PREP_REASON_LABELS: Record<EventPrepReason, string> = {
  activation: "À activer dans l'espace dev",
  time: "Heure d'arrivée à confirmer",
  modules: 'Aucune section activée',
};

export function eventPrepReasons(input: {
  status: EventLifecycleStatus;
  /** Admin has activated it (it shows in the dev workspace). */
  devActivated: boolean;
  /** `Event.startMinutes` is non-null (a human confirmed the hour). */
  startTimeConfirmed: boolean;
  /** Number of enabled `EventConfig_Module` rows. */
  moduleCount: number;
}): EventPrepReason[] {
  // A finished event has nothing left to prepare.
  if (input.status === 'past') return [];
  // The gate comes first: until it's activated the event is invisible to the
  // dev team, so "validate it" is the single next action - we don't nag about
  // time/modules on something that isn't live yet.
  if (!input.devActivated) return ['activation'];
  const reasons: EventPrepReason[] = [];
  if (!input.startTimeConfirmed) reasons.push('time');
  if (input.moduleCount === 0) reasons.push('modules');
  return reasons;
}
