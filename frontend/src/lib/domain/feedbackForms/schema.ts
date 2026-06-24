export type QuestionType =
  | 'single'
  | 'multiple'
  | 'scale'
  | 'text'
  | 'textarea';
export type InputKind = 'email' | 'tel' | 'name' | 'text';

export type IdentityField =
  | 'email'
  | 'phone'
  | 'firstName'
  | 'lastName'
  | 'civility'
  | 'campus';

/**
 * Runtime input kind derived from an identity field, so identity text questions
 * validate (email / tel) without the author setting `inputKind` separately. Name
 * fields map to `name` (plain text, future hook); civility / campus need no
 * validation (and are usually authored as a `single` choice), hence `null`.
 */
export const IDENTITY_FIELD_TO_INPUT_KIND: Record<
  IdentityField,
  InputKind | null
> = {
  email: 'email',
  phone: 'tel',
  firstName: 'name',
  lastName: 'name',
  civility: null,
  campus: null,
};

/** Identity fields with their French label, in builder display order. Single
 *  source for the badge and the builder's identity selector (mirrors the
 *  `Feedback_IdentityField` enum). */
export const IDENTITY_FIELD_OPTIONS: { value: IdentityField; label: string }[] =
  [
    { value: 'email', label: 'E-mail' },
    { value: 'phone', label: 'Téléphone' },
    { value: 'firstName', label: 'Prénom' },
    { value: 'lastName', label: 'Nom' },
    { value: 'civility', label: 'Civilité' },
    { value: 'campus', label: 'Campus' },
  ];

/**
 * Natural question type for each identity field, used to auto-configure a question
 * when an identity field is picked: text-like data becomes a short text input,
 * civility / campus a single choice. Keeps an identity field off an incompatible
 * type (e.g. an e-mail rendered as a star rating).
 */
export const IDENTITY_FIELD_TO_QUESTION_TYPE: Record<
  IdentityField,
  QuestionType
> = {
  email: 'text',
  phone: 'text',
  firstName: 'text',
  lastName: 'text',
  civility: 'single',
  campus: 'single',
};

/**
 * Identity known about the respondent, used to interpolate bot copy
 * (`Salut {prenom} !`). For a connected talent it is seeded from `Talent`; for a
 * public respondent it is filled in as the identity questions are answered.
 */
export interface IdentityContext {
  prenom?: string;
  nom?: string;
  campus?: string;
  civilite?: string;
}

/** Identity fields that feed an interpolation token (email/phone aren't used in copy). */
export const IDENTITY_FIELD_TO_CONTEXT_KEY: Partial<
  Record<IdentityField, keyof IdentityContext>
> = {
  firstName: 'prenom',
  lastName: 'nom',
  campus: 'campus',
  civility: 'civilite',
};

const INTERPOLATION_TOKENS: ReadonlySet<keyof IdentityContext> = new Set([
  'prenom',
  'nom',
  'campus',
  'civilite',
]);

/**
 * Replaces `{token}` placeholders in bot copy with the respondent's identity.
 * Known tokens resolve to their value (or empty string if not yet known);
 * unknown tokens are left untouched so authored braces survive.
 */
export function interpolate(text: string, ctx: IdentityContext): string {
  return text.replace(/{(\w+)}/g, (whole, key: string) =>
    INTERPOLATION_TOKENS.has(key as keyof IdentityContext)
      ? (ctx[key as keyof IdentityContext] ?? '')
      : whole,
  );
}

/**
 * Generalises the "never orphan a glyph at a line edge" rule to emoji: binds an
 * emoji to the word before it with a no-break space, so a label like
 * "…j'en veux plus 🔥" never drops the 🔥 alone onto its own line in a narrow
 * column. The emoji and its preceding word wrap together as one unit. A ZWJ /
 * skin-tone sequence (its parts are contiguous) is carried whole by the bind on
 * its first codepoint. Display-only: only existing spaces are tightened.
 */
export function bindEmoji(text: string): string {
  return text.replace(/[   ]+(\p{Extended_Pictographic})/gu, ' $1');
}

/**
 * Display typography for chat copy and option labels: French punctuation spacing
 * then emoji binding, so neither a lone "?" nor a lone emoji ever wraps onto its
 * own line. Never run it on a value that gets persisted: it rewrites spaces.
 */
export function typesetChat(text: string): string {
  return bindEmoji(applyFrenchSpacing(text));
}

/**
 * French typography for chat bubbles: binds the punctuation that takes a leading
 * space (`? ! : ;` and the closing guillemet) to the word before it with a
 * no-break space, and the opening guillemet to the word after it. This stops a
 * lone `?` (or `!`, `:`…) from wrapping onto its own line at a bubble's edge.
 * Display-only: only existing spaces are tightened, never inserted, so values
 * without French spacing (an e-mail, a time like `9:30`) are left untouched.
 */
export function applyFrenchSpacing(text: string): string {
  return text
    .replace(/[\u0020\u00A0\u202F]+([?!:;»])/g, '\u00A0$1')
    .replace(/(«)[\u0020\u00A0\u202F]+/g, '$1\u00A0');
}

export interface Question {
  id: string;
  section?: string;
  sectionIntro?: string;
  prompt: string;
  required: boolean;
  type: QuestionType;
  options?: string[];
  extraOptions?: string[];
  minSelections?: number;
  maxSelections?: number;
  inputKind?: InputKind;
  placeholder?: string;
  identityField?: IdentityField;
  /** Label -> bot reaction, for options that carry one. */
  optionReactions?: Record<string, string>;
}

export interface FormSchema {
  id: string;
  title: string;
  intro: string;
  /** Closing bot line; falls back to a generic message when absent. */
  outro?: string;
  /** Name of the chat persona; falls back to the default mascot when absent. */
  personaName?: string;
  questions: Question[];
}

export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue>;

/**
 * Upper bound on a single free-text answer (`text` / `textarea`). The public
 * submit endpoint is unauthenticated, so this caps what an anonymous respondent
 * can persist per field; the SvelteKit body limit only bounds the whole request.
 */
export const MAX_FREE_TEXT_LENGTH = 5000;

export function validateAnswer(
  q: Question,
  value: AnswerValue | undefined,
): string | null {
  const isEmpty =
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);

  if (isEmpty) {
    return q.required ? 'Cette réponse est requise.' : null;
  }

  // Validate against the shape `recordSubmission` will actually persist, never
  // gated on the runtime type. The public endpoint is reachable directly, so a
  // client can post a `multiple` answer as a bare string or a free-text answer as
  // an array to slip past a type-gated guard (and, for free text, past the length
  // cap, since the array is later joined into one unbounded string).
  if (q.type === 'multiple') {
    const count = Array.isArray(value) ? value.length : 1;
    if (q.minSelections !== undefined && count < q.minSelections) {
      return `Veuillez sélectionner au moins ${q.minSelections} option(s).`;
    }
    if (q.maxSelections !== undefined && count > q.maxSelections) {
      return `Veuillez sélectionner au plus ${q.maxSelections} option(s).`;
    }
  }

  if (q.type === 'text' || q.type === 'textarea') {
    // Mirror the persistence join so the cap bounds what lands in `freeText`.
    const text = Array.isArray(value) ? value.join(', ') : value;
    if (text.length > MAX_FREE_TEXT_LENGTH) {
      return `Réponse trop longue (maximum ${MAX_FREE_TEXT_LENGTH} caractères).`;
    }
    if (q.inputKind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      return 'Adresse e-mail invalide.';
    }
    if (q.inputKind === 'tel' && !/^[+0-9 ().-]{6,20}$/.test(text)) {
      return 'Numéro de téléphone invalide.';
    }
  }

  return null;
}
