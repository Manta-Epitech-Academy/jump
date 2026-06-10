import w1 from './w1.json';
import w2 from './w2.json';

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

const FORMS: Record<string, FormSchema> = {
  w1: w1 as FormSchema,
  w2: w2 as FormSchema,
};

export function loadForm(id: string): FormSchema | null {
  return FORMS[id] ?? null;
}

export function validateAnswer(
  q: Question,
  value: AnswerValue | undefined,
): string | null {
  const isEmpty =
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);

  if (isEmpty) {
    return q.required ? 'Cette reponse est requise.' : null;
  }

  if (q.type === 'multiple' && Array.isArray(value)) {
    if (q.minSelections !== undefined && value.length < q.minSelections) {
      return `Veuillez sélectionner au moins ${q.minSelections} option(s).`;
    }
    if (q.maxSelections !== undefined && value.length > q.maxSelections) {
      return `Veuillez sélectionner au plus ${q.maxSelections} option(s).`;
    }
  }

  if (q.type === 'text' && typeof value === 'string') {
    if (q.inputKind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Adresse e-mail invalide.';
    }
    if (q.inputKind === 'tel' && !/^[+0-9 ().-]{6,20}$/.test(value)) {
      return 'Numéro de téléphone invalide.';
    }
  }

  return null;
}
