/**
 * Where EpiDuck is, and what moves him (#539). Pure, so the header's duck can
 * be reasoned about without a DOM.
 *
 * He is on the water (`awake`), going under (`diving`), under (`under`) or
 * coming back up (`emerging`). One thing sends him under: the talent putting
 * him to sleep, which is stored and lasts until the talent wakes him. So the
 * sleep button always says where he is.
 * He no longer sulks under it after too many pokes (`mascot.md`, « He does
 * not sulk »).
 */

export type MascotPhase = 'awake' | 'diving' | 'under' | 'emerging';

export type MascotEvent =
  /** The talent puts him to sleep. */
  | 'sleep'
  /** The talent wakes him. */
  | 'wake'
  /** The dive finished. */
  | 'dove'
  /** The way up finished. */
  | 'emerged';

export function nextPhase(state: MascotPhase, event: MascotEvent): MascotPhase {
  switch (state) {
    case 'awake':
      return event === 'sleep' ? 'diving' : state;
    case 'diving':
      if (event === 'dove') return 'under';
      // Woken on the way down: he turns round.
      return event === 'wake' ? 'emerging' : state;
    case 'under':
      return event === 'wake' ? 'emerging' : state;
    case 'emerging':
      if (event === 'emerged') return 'awake';
      // Put back to sleep on the way up: he turns round.
      return event === 'sleep' ? 'diving' : state;
  }
}

/** Asleep, as the talent sees it: what the sleep button shows pressed. */
export function isAsleep(state: MascotPhase): boolean {
  return state === 'diving' || state === 'under';
}
