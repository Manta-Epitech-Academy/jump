/**
 * Contrôleur de la conversation (state machine du fil de discussion).
 *
 * Utilise les runes Svelte 5 dans un module `.svelte.ts`. Pilote l'enchaînement
 * bot → réponse utilisateur → question suivante, avec indicateur de frappe,
 * en-têtes de section et validation.
 */
import type { FormSchema, Question, Answers, AnswerValue } from './schema';
import { validateAnswer } from './schema';

export type ChatRole = 'bot' | 'user';

export interface ChatMessage {
  id: number;
  role: ChatRole;
  text: string;
  time: string;
}

export type ConvStatus = 'idle' | 'typing' | 'awaiting' | 'done';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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

  constructor(form: FormSchema) {
    this.form = form;
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

  async #botSay(text: string, delay = 650) {
    this.status = 'typing';
    await sleep(delay);
    this.#push('bot', text);
  }

  /** Démarre la conversation (intro + première question). */
  async start() {
    if (this.status !== 'idle') return;
    await this.#botSay(this.form.intro, 450);
    await this.#ask();
  }

  async #ask() {
    const q = this.form.questions[this.index];
    if (!q) {
      await this.#botSay(
        "Merci, c'est tout bon ! Je prépare ton récapitulatif. 🎉",
        500,
      );
      this.status = 'done';
      return;
    }
    if (q.section && q.section !== this.#lastSection) {
      this.#lastSection = q.section;
      if (q.sectionIntro) await this.#botSay(q.sectionIntro, 500);
    }
    await this.#botSay(q.prompt);
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
    }

    this.index += 1;
    await this.#ask();
  }
}
