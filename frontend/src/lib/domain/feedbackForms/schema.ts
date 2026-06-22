export type QuestionType =
  | 'single'
  | 'multiple'
  | 'scale'
  | 'text'
  | 'textarea'
  | 'gate';
export type InputKind = 'email' | 'tel' | 'name' | 'text';

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
  identity?: boolean;
  skipsIdentity?: boolean;
  skipOption?: string;
}

export interface FormSchema {
  id: string;
  title: string;
  intro: string;
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

  if (q.type === 'multiple' && Array.isArray(value)) {
    if (q.minSelections !== undefined && value.length < q.minSelections) {
      return `Veuillez sélectionner au moins ${q.minSelections} option(s).`;
    }
    if (q.maxSelections !== undefined && value.length > q.maxSelections) {
      return `Veuillez sélectionner au plus ${q.maxSelections} option(s).`;
    }
  }

  if (
    (q.type === 'text' || q.type === 'textarea') &&
    typeof value === 'string'
  ) {
    if (value.length > MAX_FREE_TEXT_LENGTH) {
      return `Réponse trop longue (maximum ${MAX_FREE_TEXT_LENGTH} caractères).`;
    }
    if (q.inputKind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Adresse e-mail invalide.';
    }
    if (q.inputKind === 'tel' && !/^[+0-9 ().-]{6,20}$/.test(value)) {
      return 'Numéro de téléphone invalide.';
    }
  }

  return null;
}
