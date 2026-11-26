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
 * Two ways to speak. A poke, a goodnight, a good morning and a badge the
 * talent asks about (`explain`) answer the talent at once, over whatever he
 * was saying. Everything else he has to say (what he
 * says on arrival, a reaction to what the talent just did, #540) waits its
 * turn in a queue, one bubble after the other, so a reaction never cuts a
 * greeting short. A celebration takes him to the middle of the screen
 * (`enterStage`), and the queue waits for him to come back. A celebration is
 * also the visit's greeting: once he has been on stage, he does not come back
 * to say hello as well.
 *
 * How the talent dressed him is his state too (`choice`, `look`): the settings
 * change it here, so every duck on screen wears a choice the moment it is
 * made, and the server is sent each change in the order it was made
 * (`LatestSaver`, #552). Nothing reads his look off the page's data, which the
 * layout loads once and never again while the talent moves between pages.
 */

import { getContext, setContext } from 'svelte';
import { prefersReducedMotion } from 'svelte/motion';
import { toast } from 'svelte-sonner';
import { LatestSaver } from '#lib/latestSaver.svelte.ts';
import { pickLine } from '#lib/domain/pickLine.ts';
import { typeset } from '#lib/domain/typography.ts';
import {
  MASCOT_MOMENTS,
  fillLine,
  type MascotBadgeMoment,
  sameMascotChoice,
  shownMascotLook,
  type MascotChoice,
  type MascotCue,
  type MascotLook,
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
import { putMascotToSleep, saveMascotLook } from './mascot.remote';

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
/** How long he beams when he rejoices without a word (`rejoice`). */
export const REJOICE_MS = 1600;
/**
 * Marks a tab whose talent he already greeted: once per visit, not on every
 * page and not again on a reload. Per tab and per browser, which is what a
 * visit is; losing it (private window, blocked storage) only means one more
 * hello.
 */
const GREETED_KEY = 'epiduck:greeted';

/** A line he is saying in the header, drawn by `MascotBubble`. */
export type SpokenLine = { text: string; id: number; mood: MascotMood };

/** A badge the talent clicked, and what the duck may say of it (#551). */
export type BadgeQuestion = {
  /** The badge's key: its lines rotate on it, click after click. */
  key: string;
  moment: MascotBadgeMoment;
  /** Its live lines for that moment, in the order they were written. */
  lines: readonly string[];
  /** What he says with no line: the badge's condition, the PO's sentence. */
  condition: string;
  tokens: MascotTokenValues;
};

export type MascotControllerInit = {
  talentId: string;
  asleep: boolean;
  /** How the talent dressed him, as the server holds it. */
  choice: MascotChoice;
  /** Read each time he speaks, so a line written today arrives on next load. */
  voice: () => MascotVoice;
  /** The tokens his lines may cite; `{canard}` is his own name, added here. */
  tokens: () => MascotTokenValues;
  /**
   * What he may say when the talent arrives, best first (`arrivalCues`): he
   * says the first with a live line, once per visit.
   */
  arrival: MascotCue[];
  today: string;
};

export class MascotController {
  state = $state<MascotPhase>({ phase: 'awake' });
  bubble = $state<SpokenLine | null>(null);
  /**
   * He is beaming, eyes squeezed in joy: for as long as he says good news, or
   * for a moment when he rejoices without a word. An id, so the header hops
   * once per joy and not once per render.
   */
  joy = $state<number | null>(null);
  /**
   * He is in the middle of the screen, drawn by a celebration (`enterStage`):
   * the header's duck steps out of sight meanwhile, so there is never two of
   * him.
   */
  onStage = $state(false);
  /** He stops and turns to the talent while he speaks or beams. */
  facingTalent = $derived(
    (this.bubble !== null || this.joy !== null) && this.state.phase === 'awake',
  );
  /** Up from his sleep only to answer the talent, then back under. */
  #answering = $state(false);
  /**
   * Asleep, as the talent chose: under the water, or up for a moment to
   * answer what they asked (`explain`), after which he goes back under. The
   * sleep button reads this, so it stays pressed through the answer.
   */
  asleep = $derived(isAsleep(this.state) || this.#answering);
  /** How the talent dressed him, an empty name being his own. */
  choice: MascotChoice;
  /** How he is drawn: the choice, with his own name if it was left empty. */
  look: MascotLook;
  /** A change of his look is on its way to the server. */
  savingLook: boolean;

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
  /** How many times each badge was asked about, so its lines take turns. */
  #badgeTurns = new Map<string, number>();
  /** An answer he says once he is up, on the water and free. */
  #pendingAnswer: { text: string; mood: MascotMood } | null = null;
  #bubbleId = 0;
  #arrived = false;
  /** The arrival line, until it is said or a celebration takes its place. */
  #arrival: MascotCue | null = null;
  #arrivalTimer: ReturnType<typeof setTimeout> | undefined;
  /** The stage holding him, which alone may let him go (`enterStage`). */
  #stage: object | null = null;
  #queue: MascotCue[] = [];
  #bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  #nextTimer: ReturnType<typeof setTimeout> | undefined;
  #phaseTimer: ReturnType<typeof setTimeout> | undefined;
  #joyTimer: ReturnType<typeof setTimeout> | undefined;
  #lookSaver: LatestSaver<MascotChoice>;
  #sleepSaver: LatestSaver<boolean>;
  /** Where he was when the presses being saved began, to go back to it. */
  #beforeSleepChange: MascotPhase = { phase: 'awake' };

  constructor(init: MascotControllerInit) {
    this.#init = init;
    this.choice = $state.raw(init.choice);
    this.#lookSaver = new LatestSaver({
      saved: init.choice,
      save: (choice) => saveMascotLook(choice),
      onFailed: (saved, error) => {
        console.error('[mascot] look not saved:', error);
        this.choice = saved;
        toast.error("Ton canard n'a pas pu être enregistré. Réessaie.");
      },
      same: sameMascotChoice,
    });
    this.#sleepSaver = new LatestSaver({
      saved: init.asleep,
      save: (asleep) => putMascotToSleep({ asleep }),
      onFailed: (stored, error) => {
        console.error('[mascot] sleep not saved:', error);
        this.#sleepRefused(stored);
      },
    });
    this.look = $derived(shownMascotLook(this.choice));
    this.savingLook = $derived(this.#lookSaver.busy);
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
   * The talent clicked a badge in their collection (#551): he says what it
   * is, at once, over whatever he was saying, as he answers a poke. One of
   * the badge's lines for the state it is in, taking turns click after click,
   * or its condition when the PO wrote none.
   *
   * Asleep, he still answers: the talent asked him something, and sleep
   * quiets what he does of his own accord, never his answer to what the
   * talent did. He comes up, says it, and goes back under, and the stored
   * preference is never touched. Under for a sulk, or on his way up, he says
   * it once he is on the water. On stage, the question goes unanswered: the
   * stage is a celebration with its own words, and nothing waits behind it.
   */
  explain(question: BadgeQuestion): void {
    if (this.onStage) return;
    const answer = {
      text: this.#spoken(this.#badgeLine(question), question.tokens),
      mood: MASCOT_MOMENTS[question.moment].mood,
    };
    if (this.state.phase === 'awake') {
      this.#show(answer.text, answer.mood);
      return;
    }
    this.#pendingAnswer = answer;
    if (isAsleep(this.state)) {
      this.#answering = true;
      this.#dispatch('wake');
    }
  }

  #badgeLine(question: BadgeQuestion): string {
    const { lines, key } = question;
    if (lines.length === 0) return question.condition;
    const turn = this.#badgeTurns.get(key) ?? 0;
    this.#badgeTurns.set(key, turn + 1);
    const start = lines.indexOf(
      pickLine(lines, `${this.#init.talentId}:${this.#init.today}:${key}`),
    );
    return lines[(start + turn) % lines.length];
  }

  /**
   * The settings changed how he looks: worn at once wherever he is drawn, and
   * saved behind any change still on its way. Refused, he goes back to the
   * last look the server stored.
   */
  choose(change: Partial<MascotChoice>): void {
    const next = { ...this.choice, ...change };
    if (sameMascotChoice(next, this.choice)) return;
    this.choice = next;
    this.#lookSaver.push(next);
  }

  /**
   * The sleep button: optimistic, saved in the order it was pressed
   * (`LatestSaver`, #552), and put back if the server refuses. He says
   * goodnight only if he is in sight: sent to sleep while sulking under the
   * water, he simply stays there, and a line with no duck under it would come
   * from nowhere.
   */
  setAsleep(asleep: boolean): void {
    if (asleep === this.asleep) return;
    // Woken while up to answer: he stays up, and the answer stays said.
    this.#answering = false;
    if (!this.#sleepSaver.busy) this.#beforeSleepChange = this.state;
    const inSight =
      this.state.phase === 'awake' || this.state.phase === 'emerging';
    this.#dispatch(asleep ? 'sleep' : 'wake');
    if (!asleep || inSight) this.#sayMoment(asleep ? 'sleep' : 'wake');
    this.#sleepSaver.push(asleep);
  }

  /**
   * The server refused the last press: back to what it stored, and on his way
   * again. Where he was before the presses, when that is what it stored, so a
   * dive, a sulk or a way up he was in the middle of ends as it would have and
   * a refused request never leaves him stranded between two phases.
   */
  #sleepRefused(stored: boolean): void {
    this.#hideBubble();
    const before = this.#beforeSleepChange;
    if (isAsleep(before) === stored) this.#enter(before);
    else this.#dispatch(stored ? 'sleep' : 'wake');
    toast.error(
      stored
        ? "Ton canard n'a pas pu se réveiller. Réessaie dans un instant."
        : "Ton canard n'a pas pu s'endormir. Réessaie dans un instant.",
    );
  }

  /**
   * What he says when the talent arrives, as the mockup has him greet: once
   * per visit, never on each page change, where by the third click it would
   * be noise. One line, the first of `arrival` the PO gave a live line to, so
   * a silent moment hands over to the next. Queued after the page settles,
   * like any other line.
   */
  arrive(): void {
    if (this.#arrived || this.#arrivedThisVisit()) return;
    this.#markArrived();
    const cue = this.#init.arrival.find((c) => this.lineFor(c) !== null);
    if (!cue) return;
    this.#arrival = cue;
    this.#arrivalTimer = setTimeout(() => this.react(cue), GREETING_DELAY_MS);
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
   * A hop of joy and no word: what he does when the page has already said it
   * in his name (a questionnaire he hosted thanks the talent itself, and a
   * second thanks from the header would be the same voice twice). Not while
   * he is out of sight, asleep or on stage.
   */
  rejoice(): void {
    if (this.state.phase !== 'awake' || this.onStage) return;
    const id = ++this.#bubbleId;
    this.joy = id;
    clearTimeout(this.#joyTimer);
    this.#joyTimer = setTimeout(() => {
      if (this.joy === id) this.joy = null;
    }, REJOICE_MS);
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
    return this.#spoken(line, cue.tokens);
  }

  /**
   * A celebration takes him: the header's duck steps out of sight, and what
   * he was saying there waits until he is back. The celebration is the
   * visit's greeting: an arrival line not yet said is dropped, and none is
   * said on a later page of the visit. Coming back from a party to say hello
   * read as a duck who had not been there.
   *
   * Hands back what lets him go, which only the stage holding him can do, and
   * only once: a stage that took him over from another (the talent navigated
   * mid-celebration onto a page with its own) keeps him until it is done,
   * whenever the page left behind lets go.
   */
  enterStage(): () => void {
    const stage = {};
    this.#stage = stage;
    this.onStage = true;
    clearTimeout(this.#nextTimer);
    clearTimeout(this.#arrivalTimer);
    if (this.#arrival) {
      this.#queue = this.#queue.filter((cue) => cue !== this.#arrival);
      this.#arrival = null;
    }
    this.#markArrived();
    this.#hideBubble();
    return () => {
      if (this.#stage !== stage) return;
      this.#stage = null;
      this.onStage = false;
      this.#next();
    };
  }

  /** The next queued line, once he is on the water, free and in sight. */
  #next(): void {
    if (this.bubble || this.onStage) return;
    if (this.state.phase !== 'awake') return;
    clearTimeout(this.#nextTimer);
    const cue = this.#queue.shift();
    if (!cue) return;
    if (cue === this.#arrival) this.#arrival = null;
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

  #markArrived(): void {
    this.#arrived = true;
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
    this.#show(this.#spoken(line), MASCOT_MOMENTS[moment].mood);
  }

  /**
   * A line as he says it: its tokens filled, then typeset (`typeset`), so a
   * « ! » or a « : » never wraps alone onto the next line of his bubble. The
   * PO types ordinary spaces; the binding is display-only, never stored.
   */
  #spoken(line: string, tokens?: MascotTokenValues): string {
    return typeset(
      fillLine(line, {
        ...this.#init.tokens(),
        canard: this.look.name,
        ...tokens,
      }),
    );
  }

  #show(text: string, mood: MascotMood): void {
    clearTimeout(this.#bubbleTimer);
    const id = ++this.#bubbleId;
    this.bubble = { text, mood, id };
    if (mood === 'joy') this.joy = id;
    this.#bubbleTimer = setTimeout(() => {
      this.#hideBubble();
      if (this.#answering) {
        // Up only to answer: back to the sleep the talent chose.
        this.#answering = false;
        this.#dispatch('sleep');
        return;
      }
      this.#nextTimer = setTimeout(() => this.#next(), BETWEEN_LINES_MS);
    }, BUBBLE_MS);
  }

  #hideBubble(): void {
    clearTimeout(this.#bubbleTimer);
    if (this.joy === this.bubble?.id) this.joy = null;
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
    if (next.phase === 'awake' && this.#pendingAnswer) {
      const { text, mood } = this.#pendingAnswer;
      this.#pendingAnswer = null;
      this.#show(text, mood);
    }
    if (next.phase === 'awake') this.#next();
    if (isAsleep(next)) {
      this.#queue = [];
      // Sent to sleep before he was up to answer: the question is gone with him.
      this.#pendingAnswer = null;
    }
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
