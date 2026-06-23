import { z } from 'zod';

// Validation for the feedback form builder (admin). The REST endpoints parse
// request bodies with these; the list page's create form uses the superform
// variants.

export const QUESTION_TYPES = [
  'single',
  'multiple',
  'scale',
  'text',
  'textarea',
] as const;
export const INPUT_KINDS = ['email', 'tel', 'name', 'text'] as const;
export const OPTION_KINDS = ['choice', 'extra'] as const;
export const IDENTITY_FIELDS = [
  'email',
  'phone',
  'firstName',
  'lastName',
  'civility',
  'campus',
] as const;
export const FORM_STATUSES = ['draft', 'published', 'archived'] as const;

// A respondent column holds a single value, so an identity field answered as a
// `multiple` choice would silently keep only the first selection and skip the
// email/phone format check. Single-sourced so the create refine and the server
// re-check (the PATCH path bypasses this refine) speak with one voice.
export const IDENTITY_NOT_MULTIPLE_MESSAGE =
  'Une donnée d’identité ne peut pas être un choix multiple';

export const formCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  intro: z.string().trim().min(1).max(2000),
});

export const formMetaSchema = z.object({
  title: z.string().trim().min(1).max(200),
  intro: z.string().trim().min(1).max(2000),
  personaName: z.string().trim().max(100).nullish(),
  status: z.enum(FORM_STATUSES),
  allowsAuthenticatedAccess: z.boolean(),
  allowsPublicAccess: z.boolean(),
  dashboardNudge: z.boolean(),
});

// Partial patch for the auto-saving builder (every field optional, edited inline).
export const formMetaPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  intro: z.string().trim().min(1).max(2000).optional(),
  personaName: z.string().trim().max(100).nullish(),
  status: z.enum(FORM_STATUSES).optional(),
  allowsAuthenticatedAccess: z.boolean().optional(),
  allowsPublicAccess: z.boolean().optional(),
  dashboardNudge: z.boolean().optional(),
});

export const sectionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  intro: z.string().trim().max(2000).nullish(),
});

export const questionSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[a-z0-9_]+$/, 'clé en minuscules, chiffres ou _ uniquement'),
    sectionId: z.string().nullish(),
    prompt: z.string().trim().min(1).max(1000),
    type: z.enum(QUESTION_TYPES),
    required: z.boolean().default(true),
    identityField: z.enum(IDENTITY_FIELDS).nullish(),
    inputKind: z.enum(INPUT_KINDS).nullish(),
    minSelections: z.number().int().min(0).nullish(),
    maxSelections: z.number().int().min(0).nullish(),
    placeholder: z.string().trim().max(300).nullish(),
  })
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

// Partial patch: every field optional (the editor PATCHes single fields).
export const questionPatchSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/)
    .optional(),
  sectionId: z.string().nullish(),
  prompt: z.string().trim().min(1).max(1000).optional(),
  type: z.enum(QUESTION_TYPES).optional(),
  required: z.boolean().optional(),
  identityField: z.enum(IDENTITY_FIELDS).nullish(),
  inputKind: z.enum(INPUT_KINDS).nullish(),
  minSelections: z.number().int().min(0).nullish(),
  maxSelections: z.number().int().min(0).nullish(),
  placeholder: z.string().trim().max(300).nullish(),
});

export const optionSchema = z.object({
  label: z.string().trim().min(1).max(300),
  kind: z.enum(OPTION_KINDS).default('choice'),
});

export const optionPatchSchema = z.object({
  label: z.string().trim().min(1).max(300).optional(),
  kind: z.enum(OPTION_KINDS).optional(),
});

export const reorderSchema = z.object({
  ids: z.array(z.string()).min(1),
});
