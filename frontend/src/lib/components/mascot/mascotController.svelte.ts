/**
 * The talent's EpiDuck while the app is open (#539): whether he is on the
 * water, what he is saying, where he was swimming. One per talent layout, made
 * in `(talent)/+layout.svelte` and handed down by context, so he outlives the
 * page: the header is drawn by each page and remounts on every navigation, and
 * a duck that forgot where he was would jump back to the start each time.
 *
 * Client state only. It is made per layout instance, never at module level,
 * because a module is shared by every request the server renders.
 *
 * What he says is the talent's lines for the day (`MascotVoice`, authored over
 * the admin API); a moment with none leaves him silent. Lines rotate by a key,
 * never at random, as every voice in Jump does (`pickLine`), so the first poke
 * of a day does not always open with the same one.
 *
 * Two ways to speak. A poke, a goodnight and a good morning answer the talent
 * at once, over whatever he was saying. Everything else he has to say (what he
 * says on arrival, a reaction to what the talent just did, #540) waits its
 * turn in a queue, one bubble after the other, so a reaction never cuts a
 * greeting short. A celebration takes him to the middle of the screen
 * (`enterStage`), and the queue waits for him to come back.
 */

import { getContext, setContext } from 'svelte';
import { prefersReducedMotion } from 'svelte/motion';
import { toast } from 'svelte-sonner';
import { pickLine } from '#lib/domain/pickLine.ts';
import {
  MASCOT_MOMENTS,
  fillLine,
  type MascotCue,
  type MascotMomentKey,
  type MascotMood,
  type MascotTokenValues,
  type MascotVoice,
} from '#lib/domain/mascot.ts';
import {
  SULK_POKES,
  isAsleep,
  nextPhase,
  recentPokes,
  type MascotEvent,
  type MascotPhase,
} from './mascotPhase';
import { putMascotToSleep } from './mascot.remote';

/** How long a dive and a way up last: the mockup's 1.8s, or a fade. */
export const DIVE_MS = 1800;
export const EMERGE_MS = 1800;
const REDUCED_DIVE_MS = 200;
/** How long he sulks under the water before coming back on his own. */
export const SULK_MS = 6000;
/** How long a bubble stays: enough to read a short line twice. */
export const BUBBLE_MS = 5000;
/** The breath between two queued lines, so the second reads as a new one. */
export const BETWEEN_LINES_MS = 600;
/** How long after arrival he greets: the page settles first. */
export const GREETING_DELAY_MS = 2000;
/**
 * Marks a tab whose talent he already greeted: once per visit, not on every
 * page and not again on a reload. Per tab and per browser, which is what a
 * visit is; losing it (private window, blocked storage) only means one more
 * hello.
 */
const GREETED_KEY = 'epiduck:greeted';

export type MascotBubble = { text: string; id: number; mood: MascotMood };

export type MascotControllerInit = {
  talentId: string;
  asleep: boolean;
  /** Read each time he speaks, so a line written today arrives on next load. */
  voice: () => MascotVoice;
  tokens: () => MascotTokenValues;
  /** What he says when the talent arrives (`arrivalCues`), once per visit. */
  arrival: MascotCue[];
  today: string;
};

export class MascotController {
  state = $state<MascotPhase>({ phase: 'awake' });
  bubble = $state<MascotBubble | null>(null);
  /**
   * He is in the middle of the screen, drawn by a celebration: the header's
   * duck steps out of sight meanwhile, so there is never two of him.
   */
  onStage = $state(false);
  /** He stops and turns to the talent while he speaks. */
  facingTalent = $derived(this.bubble !== null && this.state.phase === 'awake');
  asleep = $derived(isAsleep(this.state));

  /**
   * Where the last header left him, in pixels from the window's left edge, so
   * the next one puts him back on the same spot even if its lane starts
   * elsewhere. Null until a header has drawn him.
   */
  x: number | null = null;
  facingLeft = false;
  /**
   * Where he was swimming to when the last page left, in the same window
   * coordinates, so the next one carries on toward it rather than picking a
   * new heading mid-stroke. Null when he was not under way.
   */
  heading: number | null = null;

  #init: MascotControllerInit;
  #pokes: number[] = [];
  #pokeTurn = 0;
  #bubbleId = 0;
  #arrived = false;
  #queue: MascotCue[] = [];
  #bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  #nextTimer: ReturnType<typeof setTimeout> | undefined;
  #phaseTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(init: MascotControllerInit) {
    this.#init = init;
    if (init.asleep) this.state = { phase: 'under', reason: 'sleep' };
  }

  get reducedMotion(): boolean {
    return prefersReducedMotion.current;
  }

  /** The talent tapped him. */
  poke(now = Date.now()): void {
    if (this.state.phase !== 'awake' || this.onStage) return;
    this.#pokes = recentPokes(this.#pokes, now);
    if (this.#pokes.length >= SULK_POKES) {
      this.#pokes = [];
      this.#hideBubble();
      this.#dispatch('sulk');
      return;
    }
    const lines = this.#init.voice().poke ?? [];
    if (lines.length === 0) return;
    const start = lines.indexOf(
      pickLine(lines, `${this.#init.talentId}:${this.#init.today}`),
    );
    this.#say(lines[(start + this.#pokeTurn++) % lines.length], 'poke');
  }

  /**
   * The sleep button: optimistic, and put back if the server refuses. He says
   * goodnight only if he is in sight: sent to sleep while sulking under the
   * water, he simply stays there, and a line with no duck under it would come
   * from nowhere.
   */
  async setAsleep(asleep: boolean): Promise<void> {
    if (asleep === this.asleep) return;
    const before = this.state;
    const inSight = before.phase === 'awake' || before.phase === 'emerging';
    this.#dispatch(asleep ? 'sleep' : 'wake');
    if (!asleep || inSight) this.#sayMoment(asleep ? 'sleep' : 'wake');
    try {
      await putMascotToSleep({ asleep });
    } catch {
      // Back where he was, and on his way again: a dive, a sulk or a way up
      // he was in the middle of ends as it would have, so a refused request
      // never leaves him stranded between two phases.
      this.#hideBubble();
      this.#enter(before);
      toast.error(
        asleep
          ? "Ton canard n'a pas pu s'endormir. Réessaie dans un instant."
          : "Ton canard n'a pas pu se réveiller. Réessaie dans un instant.",
      );
    }
  }

  /**
   * What he says when the talent arrives, as the mockup has him greet: once
   * per visit, never on each page change, where by the third click it would
   * be noise. Queued after the page settles, like any other line.
   */
  arrive(): void {
    const cues = this.#init.arrival;
    if (this.#arrived || cues.length === 0 || this.#arrivedThisVisit()) return;
    this.#arrived = true;
    this.#rememberArrived();
    setTimeout(() => {
      for (const cue of cues) this.react(cue);
    }, GREETING_DELAY_MS);
  }

  /**
   * Something the talent did or is about to do, said in its turn after
   * whatever he is saying. Asleep, he says nothing, and nothing waits for him
   * to wake: the talent put him to sleep to have quiet.
   */
  react(cue: MascotCue): void {
    if (this.asleep) return;
    this.#queue.push(cue);
    this.#next();
  }

  /**
   * The line `cue` is said with today, its tokens filled, or null when the
   * moment has no live line: what a page that draws him itself (a scene, the
   * welcome screen, the émargement) puts in his bubble.
   */
  lineFor(cue: MascotCue): string | null {
    const lines = this.#init.voice()[cue.moment] ?? [];
    if (lines.length === 0) return null;
    const line = pickLine(lines, `${this.#init.talentId}:${this.#init.today}`);
    return fillLine(line, { ...this.#init.tokens(), ...cue.tokens });
  }

  /**
   * A celebration takes him: the header's duck steps out of sight, and what
   * he was saying there waits until he is back (`leaveStage`).
   */
  enterStage(): void {
    this.onStage = true;
    clearTimeout(this.#nextTimer);
    this.#hideBubble();
  }

  leaveStage(): void {
    this.onStage = false;
    this.#next();
  }

  /** The next queued line, once he is on the water, free and in sight. */
  #next(): void {
    if (this.bubble || this.onStage) return;
    if (this.state.phase !== 'awake') return;
    clearTimeout(this.#nextTimer);
    const cue = this.#queue.shift();
    if (!cue) return;
    const text = this.lineFor(cue);
    // A moment with no line is silence: on to the next one.
    if (text === null) return this.#next();
    this.#show(text, MASCOT_MOMENTS[cue.moment].mood);
  }

  #arrivedThisVisit(): boolean {
    try {
      return sessionStorage.getItem(GREETED_KEY) === this.#init.talentId;
    } catch {
      return false;
    }
  }

  #rememberArrived(): void {
    try {
      sessionStorage.setItem(GREETED_KEY, this.#init.talentId);
    } catch {
      // Storage refused: the next load greets again, which is harmless.
    }
  }

  #sayMoment(moment: MascotMomentKey): void {
    const text = this.lineFor({ moment });
    if (text !== null) this.#show(text, MASCOT_MOMENTS[moment].mood);
  }

  #say(line: string, moment: MascotMomentKey): void {
    this.#show(
      fillLine(line, this.#init.tokens()),
      MASCOT_MOMENTS[moment].mood,
    );
  }

  #show(text: string, mood: MascotMood): void {
    clearTimeout(this.#bubbleTimer);
    this.bubble = { text, mood, id: ++this.#bubbleId };
    this.#bubbleTimer = setTimeout(() => {
      this.#hideBubble();
      this.#nextTimer = setTimeout(() => this.#next(), BETWEEN_LINES_MS);
    }, BUBBLE_MS);
  }

  #hideBubble(): void {
    clearTimeout(this.#bubbleTimer);
    this.bubble = null;
  }

  /** Moves him, if the event moves him at all. */
  #dispatch(event: MascotEvent): void {
    const next = nextPhase(this.state, event);
    if (next !== this.state) this.#enter(next);
  }

  /**
   * Puts him in a phase and schedules the end of whatever movement it is: the
   * one way a phase is entered, so none is ever left without what ends it.
   * The controller owns the timing rather than the header's animation, so he
   * still lands somewhere on a page that draws no header.
   */
  #enter(next: MascotPhase): void {
    this.state = next;
    clearTimeout(this.#phaseTimer);
    if (next.phase === 'awake') this.#next();
    if (isAsleep(next)) this.#queue = [];
    const dive = this.reducedMotion ? REDUCED_DIVE_MS : DIVE_MS;
    const emerge = this.reducedMotion ? REDUCED_DIVE_MS : EMERGE_MS;
    if (next.phase === 'diving') {
      this.#phaseTimer = setTimeout(() => this.#dispatch('dove'), dive);
    } else if (next.phase === 'emerging') {
      this.#phaseTimer = setTimeout(() => this.#dispatch('emerged'), emerge);
    } else if (next.phase === 'under' && next.reason === 'sulk') {
      this.#phaseTimer = setTimeout(() => this.#dispatch('surface'), SULK_MS);
    } else if (next.phase === 'under') {
      // Asleep: the goodnight leaves with him.
      this.#hideBubble();
    }
  }
}

const KEY = Symbol('epiduck');

type MascotGetter = () => MascotController | null;

/** Hands the talent's duck down, as a getter: he appears on sign-in. */
export function provideMascot(get: MascotGetter): void {
  setContext(KEY, get);
}

/**
 * The talent's duck, read through the getter so a caller deriving from it
 * follows a sign-in. Null outside the talent space and before sign-in.
 */
export function useMascot(): MascotGetter {
  return getContext<MascotGetter | undefined>(KEY) ?? (() => null);
}
