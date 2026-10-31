import { z } from 'zod';

// The fields of a feedback form, its sections, questions and options, as the
// admin API's whole-form write (`write_feedback_form`) validates them.

const QUESTION_TYPES = [
  'single',
  'multiple',
  'scale',
  'text',
  'textarea',
] as const;
const INPUT_KINDS = ['email', 'tel', 'name', 'text'] as const;
const OPTION_KINDS = ['choice', 'extra'] as const;
const IDENTITY_FIELDS = [
  'email',
  'phone',
  'firstName',
  'lastName',
  'civility',
  'campus',
] as const;
const FORM_STATUSES = ['draft', 'published', 'archived'] as const;

// A respondent column holds a single value, so an identity field answered as a
// `multiple` choice would silently keep only the first selection and skip the
// email/phone format check. Single-sourced so the refine below and the
// authoring rules speak with one voice.
export const IDENTITY_NOT_MULTIPLE_MESSAGE =
  'Une donnée d’identité ne peut pas être un choix multiple';

/** The settings of a whole form, as the admin API's whole-form write states them. */
export const formFields = {
  title: z.string().trim().min(1).max(200),
  // Optional, like outro: an empty intro falls back to the default greeting.
  intro: z.string().trim().max(2000).nullish(),
  outro: z.string().trim().max(2000).nullish(),
  personaName: z.string().trim().max(100).nullish(),
  status: z.enum(FORM_STATUSES),
  allowsAuthenticatedAccess: z.boolean(),
  allowsPublicAccess: z.boolean(),
  dashboardNudge: z.boolean(),
};

export const sectionFields = {
  title: z.string().trim().min(1).max(200),
  intro: z.string().trim().max(2000).nullish(),
};

/**
 * The fields of one question, as the admin API's whole-form write takes them, so
 * a length or the key format lives once.
 */
export const questionFields = {
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, 'clé en minuscules, chiffres ou _ uniquement'),
  prompt: z.string().trim().min(1).max(1000),
  type: z.enum(QUESTION_TYPES),
  required: z.boolean().default(true),
  identityField: z.enum(IDENTITY_FIELDS).nullish(),
  inputKind: z.enum(INPUT_KINDS).nullish(),
  minSelections: z.number().int().min(0).nullish(),
  maxSelections: z.number().int().min(0).nullish(),
  placeholder: z.string().trim().max(300).nullish(),
};

type QuestionRuleInput = {
  type: (typeof QUESTION_TYPES)[number];
  identityField?: (typeof IDENTITY_FIELDS)[number] | null;
  inputKind?: (typeof INPUT_KINDS)[number] | null;
  minSelections?: number | null;
  maxSelections?: number | null;
};

/**
 * The rules between the fields of one whole question, applied wherever a whole
 * question is validated.
 */
export function withQuestionRules<T extends z.ZodType<QuestionRuleInput>>(
  schema: T,
) {
  return schema
    .refine((v) => v.type === 'text' || v.inputKind == null, {
      message: 'inputKind ne vaut que pour une question texte',
      path: ['inputKind'],
    })
    .refine((v) => !v.identityField || v.type !== 'multiple', {
      message: IDENTITY_NOT_MULTIPLE_MESSAGE,
      path: ['identityField'],
    })
    .refine((v) => v.type === 'multiple' || v.minSelections == null, {
      message: 'minSelections ne vaut que pour un choix multiple',
      path: ['minSelections'],
    })
    .refine((v) => v.type === 'multiple' || v.maxSelections == null, {
      message: 'maxSelections ne vaut que pour un choix multiple',
      path: ['maxSelections'],
    })
    .refine(
      (v) =>
        v.minSelections == null ||
        v.maxSelections == null ||
        v.minSelections <= v.maxSelections,
      { message: 'min doit être ≤ max', path: ['maxSelections'] },
    );
}

export const optionFields = {
  label: z.string().trim().min(1).max(300),
  kind: z.enum(OPTION_KINDS).default('choice'),
  reaction: z.string().trim().max(500).nullish(),
};
