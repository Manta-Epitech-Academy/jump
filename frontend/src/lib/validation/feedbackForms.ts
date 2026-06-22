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
  'gate',
] as const;
export const INPUT_KINDS = ['email', 'tel', 'name', 'text'] as const;
export const OPTION_KINDS = ['choice', 'extra', 'skip'] as const;
export const FORM_STATUSES = ['draft', 'published', 'archived'] as const;

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
    identity: z.boolean().default(false),
    inputKind: z.enum(INPUT_KINDS).nullish(),
    minSelections: z.number().int().min(0).nullish(),
    maxSelections: z.number().int().min(0).nullish(),
    skipsIdentity: z.boolean().default(false),
    placeholder: z.string().trim().max(300).nullish(),
  })
  .refine((v) => v.type === 'text' || v.inputKind == null, {
    message: 'inputKind ne vaut que pour une question texte',
    path: ['inputKind'],
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
  )
  .refine((v) => v.type === 'gate' || !v.skipsIdentity, {
    message: 'skipsIdentity ne vaut que pour une question gate',
    path: ['skipsIdentity'],
  });

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
  identity: z.boolean().optional(),
  inputKind: z.enum(INPUT_KINDS).nullish(),
  minSelections: z.number().int().min(0).nullish(),
  maxSelections: z.number().int().min(0).nullish(),
  skipsIdentity: z.boolean().optional(),
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
