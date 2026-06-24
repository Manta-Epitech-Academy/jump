/**
 * Contrôleur de la conversation (state machine du fil de discussion).
 *
 * Utilise les runes Svelte 5 dans un module `.svelte.ts`. Pilote l'enchaînement
 * bot → réponse utilisateur → question suivante, avec indicateur de frappe,
 * en-têtes de section et validation.
 *
 * Rythme : chaque tour du bot joue trois temps. Un `dwell` silencieux (points
 * masqués) qui laisse le message précédent respirer, une fenêtre de `typing`
 * (points affichés) dont la durée suit la longueur du message, puis la
 * révélation. Les points ne restent jamais affichés entre deux messages : c'est
 * ce qui fait qu'une réaction « retombe » avant la question suivante au lieu
 * d'être écrasée par des points qui ne s'éteignent pas.
 */
import type {
  FormSchema,
  Question,
  Answers,
  AnswerValue,
  IdentityContext,
} from './schema';
import {
  validateAnswer,
  interpolate,
  IDENTITY_FIELD_TO_CONTEXT_KEY,
  DEFAULT_INTRO,
  DEFAULT_OUTRO,
} from './schema';

export type ChatRole = 'bot' | 'user';

export interface ChatMessage {
  id: number;
  role: ChatRole;
  text: string;
  time: string;
}

// `pause` is a quiet beat (typing dots off) between messages, distinct from the
// pre-start `idle`. The dock only offers an input on `awaiting`.
export type ConvStatus = 'idle' | 'pause' | 'typing' | 'awaiting' | 'done';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Quiet beat before a bot message (dots off), keyed by what just happened:
 * - `open`  the very first line: no prior message to read, so no wait
 * - `snap`  right after the user answered: the bot reacts promptly
 * - `beat`  the ordinary gap between two bot messages
 * - `savor` after a reaction, before the next prompt: let the reaction land
 */
const DWELL = { open: 0, snap: 250, beat: 380, savor: 1200 } as const;
type DwellKind = keyof typeof DWELL;

/** OS "minimise animation" request; collapses every scripted delay. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** ±15% so the cadence never reads as a metronome. Reduced motion gets none. */
function jitter(ms: number): number {
  if (ms <= 0 || prefersReducedMotion()) return ms;
  return Math.round(ms * (0.85 + Math.random() * 0.3));
}

/** Length of the quiet beat before a message. */
function dwellMs(kind: DwellKind): number {
  if (prefersReducedMotion()) return kind === 'open' ? 0 : 60;
  return jitter(DWELL[kind]);
}

/** Length of the typing window: a one-word reaction is near-instant, a long
 *  prompt takes a beat to "type". */
function typingMs(text: string): number {
  if (prefersReducedMotion()) return 80;
  return jitter(Math.min(1500, Math.max(320, 260 + text.length * 16)));
}

function nowLabel(): string {
  return new Date().toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAnswer(value: AnswerValue): string {
  if (Array.isArray(value)) return value.join('  ·  ');
  return value;
}

function isEmpty(value: AnswerValue | undefined): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

export class Conversation {
  readonly form: FormSchema;

  messages = $state<ChatMessage[]>([]);
  answers = $state<Answers>({});
  index = $state(0);
  status = $state<ConvStatus>('idle');
  error = $state<string | null>(null);

  #seq = 0;
  #lastSection: string | undefined = undefined;
  // Set when the turn just emitted a reaction, so the next bot message gets the
  // generous `savor` lead-in (consumed once, in `#takeDwell`).
  #savorNext = false;
  // Identity used to interpolate bot copy. Seeded from the connected talent;
  // for a public respondent it is filled in as identity questions are answered.
  #ctx: IdentityContext;

  constructor(form: FormSchema, identity: IdentityContext = {}) {
    this.form = form;
    this.#ctx = { ...identity };
  }

  get current(): Question | undefined {
    return this.form.questions[this.index];
  }

  get total(): number {
    return this.form.questions.length;
  }

  /** Position 1-indexée de la question courante (bornée). */
  get position(): number {
    return Math.min(this.index + 1, this.total);
  }

  get isDone(): boolean {
    return this.status === 'done';
  }

  #push(role: ChatRole, text: string) {
    this.messages.push({ id: this.#seq++, role, text, time: nowLabel() });
  }

  /**
   * Plays one bot turn: quiet dwell (dots off) → typing (dots on, ∝ length) →
   * reveal. Ends on `pause` so the dots are already gone the instant the message
   * shows; a caller raises `awaiting`/`done` when the turn is terminal.
   */
  async #botSay(text: string, dwell: DwellKind) {
    this.status = 'pause';
    await sleep(dwellMs(dwell));
    this.status = 'typing';
    await sleep(typingMs(text));
    this.#push('bot', interpolate(text, this.#ctx));
    this.status = 'pause';
  }

  /**
   * Dwell for the next bot message: a one-shot generous `savor` right after a
   * reaction, otherwise the ordinary `beat`.
   */
  #takeDwell(): DwellKind {
    if (this.#savorNext) {
      this.#savorNext = false;
      return 'savor';
    }
    return 'beat';
  }

  /** Démarre la conversation (intro + première question). */
  async start() {
    if (this.status !== 'idle') return;
    const intro = this.form.intro?.trim() ? this.form.intro : DEFAULT_INTRO;
    await this.#botSay(intro, 'open');
    await this.#ask();
  }

  async #ask() {
    const q = this.form.questions[this.index];
    if (!q) {
      const outro = this.form.outro?.trim() ? this.form.outro : DEFAULT_OUTRO;
      await this.#botSay(outro, this.#takeDwell());
      this.status = 'done';
      return;
    }
    if (q.section && q.section !== this.#lastSection) {
      this.#lastSection = q.section;
      if (q.sectionIntro) await this.#botSay(q.sectionIntro, this.#takeDwell());
    }
    await this.#botSay(q.prompt, this.#takeDwell());
    this.error = null;
    this.status = 'awaiting';
  }

  /**
   * Soumet une réponse à la question courante.
   * `display` permet d'afficher dans la bulle un texte différent de la valeur
   * stockée (ex. émoji + libellé pour une note), sans polluer les données / le PDF.
   */
  async answer(value: AnswerValue, display?: string) {
    const q = this.current;
    if (!q || this.status !== 'awaiting') return;

    const err = validateAnswer(q, value);
    if (err) {
      this.error = err;
      return;
    }
    this.error = null;

    if (isEmpty(value)) {
      this.#push('user', '— (je passe)');
    } else {
      this.answers[q.id] = value;
      this.#push('user', display ?? formatAnswer(value));
      this.#captureIdentity(q, value);
      // A reaction earns the next prompt a `savor` lead-in (see `#takeDwell`).
      this.#savorNext = await this.#emitReactions(q, value);
    }

    this.index += 1;
    await this.#ask();
  }

  /** Fills the interpolation context from an answered identity question. */
  #captureIdentity(q: Question, value: AnswerValue) {
    if (!q.identityField || typeof value !== 'string') return;
    const key = IDENTITY_FIELD_TO_CONTEXT_KEY[q.identityField];
    if (key) this.#ctx[key] = value;
  }

  /**
   * Emits the persona's reaction for each chosen option that carries one. Each lands
   * promptly (`snap`); the savoured pause comes after, on the following prompt.
   * Returns whether at least one reaction was emitted.
   */
  async #emitReactions(q: Question, value: AnswerValue): Promise<boolean> {
    if (!q.optionReactions) return false;
    let emitted = false;
    for (const label of Array.isArray(value) ? value : [value]) {
      const reaction = q.optionReactions[label];
      if (reaction) {
        await this.#botSay(reaction, 'snap');
        emitted = true;
      }
    }
    return emitted;
  }
}
