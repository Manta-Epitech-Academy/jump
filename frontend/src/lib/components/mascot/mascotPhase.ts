/**
 * Where EpiDuck is, and what moves him (#539). Pure, so the header's duck can
 * be reasoned about without a DOM.
 *
 * He is on the water (`awake`), going under (`diving`), under (`under`) or
 * coming back up (`emerging`). Two things send him under, and they come back
 * differently: the talent putting him to sleep, which is stored and lasts until
 * the talent wakes him, and a sulk after being poked too often, which is his
 * own and ends by itself.
 */

export type MascotUnderReason = 'sleep' | 'sulk';

export type MascotPhase =
  | { phase: 'awake' }
  | { phase: 'diving'; reason: MascotUnderReason }
  | { phase: 'under'; reason: MascotUnderReason }
  | { phase: 'emerging' };

export type MascotEvent =
  /** The talent puts him to sleep. */
  | 'sleep'
  /** The talent wakes him. */
  | 'wake'
  /** He has had enough pokes. */
  | 'sulk'
  /** His sulk is over. */
  | 'surface'
  /** The dive finished. */
  | 'dove'
  /** The way up finished. */
  | 'emerged';

export function nextPhase(state: MascotPhase, event: MascotEvent): MascotPhase {
  switch (state.phase) {
    case 'awake':
      if (event === 'sleep') return { phase: 'diving', reason: 'sleep' };
      if (event === 'sulk') return { phase: 'diving', reason: 'sulk' };
      return state;
    case 'diving':
      if (event === 'dove') return { phase: 'under', reason: state.reason };
      // Woken on the way down: he turns round.
      if (event === 'wake' && state.reason === 'sleep') {
        return { phase: 'emerging' };
      }
      // Put to sleep while sulking: the sulk becomes a sleep he stays in.
      if (event === 'sleep') return { phase: 'diving', reason: 'sleep' };
      return state;
    case 'under':
      if (event === 'wake' && state.reason === 'sleep') {
        return { phase: 'emerging' };
      }
      if (event === 'surface' && state.reason === 'sulk') {
        return { phase: 'emerging' };
      }
      if (event === 'sleep') return { phase: 'under', reason: 'sleep' };
      return state;
    case 'emerging':
      if (event === 'emerged') return { phase: 'awake' };
      if (event === 'sleep') return { phase: 'diving', reason: 'sleep' };
      return state;
  }
}

/** Asleep, as the talent sees it: what the sleep button shows pressed. */
export function isAsleep(state: MascotPhase): boolean {
  return (
    (state.phase === 'diving' || state.phase === 'under') &&
    state.reason === 'sleep'
  );
}

/**
 * Pokes inside this window count towards a sulk, and this many of them start
 * one. Ten in ten seconds is no longer saying hello.
 */
export const SULK_WINDOW_MS = 10_000;
export const SULK_POKES = 10;

/** The pokes still inside the window at `now`, this one included. */
export function recentPokes(pokes: readonly number[], now: number): number[] {
  return [...pokes, now].filter((at) => now - at < SULK_WINDOW_MS);
}
