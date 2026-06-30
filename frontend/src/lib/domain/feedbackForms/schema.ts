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
  /** Opening bot line; falls back to {@link DEFAULT_INTRO} when absent. */
  intro?: string;
  /** Closing bot line; falls back to {@link DEFAULT_OUTRO} when absent. */
  outro?: string;
  /** Name of the chat persona; falls back to the default mascot when absent. */
  personaName?: string;
  /** Proxy URL of the persona's uploaded avatar; absent = the default mascot art. */
  personaIconUrl?: string;
  questions: Question[];
}

/**
 * The fields a question carries in both projections - the client editor graph
 * and the server DB graph. {@link projectQuestionToSchema} maps this plus a
 * resolved section into the flat {@link Question} the chat renderer consumes, so
 * the two projections (`projectEditorToSchema`, `toFormSchema`) share one body
 * and can't drift.
 */
export interface ProjectableQuestion {
  key: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  identityField: IdentityField | null;
  inputKind: InputKind | null;
  minSelections: number | null;
  maxSelections: number | null;
  placeholder: string | null;
  options: {
    label: string;
    kind: 'choice' | 'extra';
    reaction: string | null;
  }[];
}

/** Projects one normalized question (+ its resolved section) to the flat chat
 *  `Question`. Pure, so the client preview and the server render produce an
 *  identical shape. */
export function projectQuestionToSchema(
  q: ProjectableQuestion,
  section: { title: string; intro: string | null } | undefined,
): Question {
  const choice = q.options
    .filter((o) => o.kind === 'choice')
    .map((o) => o.label);
  const extra = q.options.filter((o) => o.kind === 'extra').map((o) => o.label);

  // An identity question derives its validation kind from the field and is always
  // required; a content question keeps what the author set.
  const inputKind = q.identityField
    ? (IDENTITY_FIELD_TO_INPUT_KIND[q.identityField] ?? undefined)
    : (q.inputKind ?? undefined);

  const optionReactions: Record<string, string> = {};
  for (const o of q.options) {
    if (o.reaction) optionReactions[o.label] = o.reaction;
  }

  return {
    id: q.key,
    section: section?.title,
    sectionIntro: section?.intro ?? undefined,
    prompt: q.prompt,
    required: q.identityField ? true : q.required,
    type: q.type,
    options: choice.length > 0 ? choice : undefined,
    extraOptions: extra.length > 0 ? extra : undefined,
    minSelections: q.minSelections ?? undefined,
    maxSelections: q.maxSelections ?? undefined,
    inputKind,
    placeholder: q.placeholder ?? undefined,
    identityField: q.identityField ?? undefined,
    optionReactions:
      Object.keys(optionReactions).length > 0 ? optionReactions : undefined,
  };
}

/**
 * The mascot shown when a form sets no custom persona. Single source for the
 * name + art so the duck is never hardcoded at a render site; every fallback
 * reads from here, and a form fully overrides both via `personaName` /
 * `personaIconUrl`.
 */
export const DEFAULT_PERSONA = {
  name: 'Bernard le canard',
  iconUrl: '/canard.png',
} as const;

/**
 * Opening line the persona speaks when a form sets no custom `intro`. There is
 * always a greeting; this is what "leave the intro empty" produces. Kept free of
 * {@link interpolate} tokens so it reads correctly for a public respondent (who
 * has no known first name). Single source, like {@link DEFAULT_OUTRO}.
 */
export const DEFAULT_INTRO =
  'Salut ! On prend deux minutes pour ton avis ? C’est parti. 🙌';

/**
 * Closing line the persona speaks when a form sets no custom `outro`. There is
 * always a goodbye message; this is what "leave the outro empty" produces.
 * Single source so the chat engine (`conversation.svelte.ts`) and the builder's
 * help text can never disagree about it.
 */
export const DEFAULT_OUTRO =
  "Merci, c'est tout bon ! Je prépare ton récapitulatif. 🎉";

/**
 * Builds the public proxy URL for a form's persona icon, or `undefined` when the
 * form has no custom icon (callers fall back to {@link DEFAULT_PERSONA}). The
 * `?v=<key>` busts the browser cache on replace: a new upload gets a new key, so
 * the URL changes even though the path (keyed by form id) is stable. Pure, so the
 * client projection and the server projection produce identical URLs.
 */
export function buildPersonaIconUrl(
  formId: string,
  key: string | null | undefined,
): string | undefined {
  return key
    ? `/api/feedback-forms/${formId}/persona-icon?v=${key}`
    : undefined;
}

export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue>;

/**
 * Upper bound on a single free-text answer (`text` / `textarea`). The public
 * submit endpoint is unauthenticated, so this caps what an anonymous respondent
 * can persist per field; the SvelteKit body limit only bounds the whole request.
 */
export const MAX_FREE_TEXT_LENGTH = 5000;

/**
 * Whether a value doesn't count as an answer: absent, blank (incl. a
 * whitespace-only string), or an empty list. Single source shared by the chat
 * controller, server-side validation, and persistence so "what is unanswered"
 * can never drift between them (it once did: the server kept a whitespace-only
 * string the client dropped). Accepts `null` so a crafted JSON `null` is treated
 * as empty rather than dereferenced downstream.
 */
export function isEmptyAnswer(value: AnswerValue | null | undefined): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return value.trim() === '';
}

export function validateAnswer(
  q: Question,
  value: AnswerValue | undefined,
): string | null {
  if (isEmptyAnswer(value)) {
    return q.required ? 'Cette réponse est requise.' : null;
  }

  // Option-backed types must reference an option the question actually offers.
  // `recordSubmission` resolves an answer by (question, label) and silently drops
  // a label it can't match, so without this a required single/scale/multiple could
  // pass validation yet persist nothing - the "required" guarantee, broken. The
  // trigger is a crafted payload or a client whose form was relabelled mid-session.
  if (q.type === 'single' || q.type === 'scale' || q.type === 'multiple') {
    const allowed = new Set([...(q.options ?? []), ...(q.extraOptions ?? [])]);
    const picked: string[] = Array.isArray(value)
      ? value
      : value
        ? [value]
        : [];
    if (picked.some((label) => !allowed.has(label))) {
      return 'Cette réponse ne fait pas partie des choix proposés.';
    }
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
    // `value` is non-empty here (isEmptyAnswer ruled out absent/blank above); the
    // `?? ''` only satisfies the type, since the narrowing isn't carried across the
    // isEmptyAnswer call.
    const text = Array.isArray(value) ? value.join(', ') : (value ?? '');
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
