import { z } from 'zod';
import { difficultes } from '$lib/domain/xp';

export { difficultes };

export const activityTypes = [
  'atelier',
  'conference',
  'quiz',
  'orga',
  'special',
  'break',
] as const;

export const activityTypeLabels: Record<
  (typeof activityTypes)[number],
  string
> = {
  atelier: 'Atelier',
  conference: 'Conférence',
  quiz: 'Quiz',
  orga: 'Organisation',
  special: 'Spécial',
  break: 'Pause',
};

/**
 * Centralised color tokens per activity type — used to style activity cards,
 * badges, and the calendar planner. Keep in sync with `activityTypes`.
 */
export const activityTypeStyles: Record<
  (typeof activityTypes)[number],
  { bg: string; border: string; text: string; accent: string }
> = {
  atelier: {
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    border: 'border-l-teal-500',
    text: 'text-teal-900 dark:text-teal-100',
    accent: 'text-teal-700 dark:text-teal-300',
  },
  conference: {
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    border: 'border-l-indigo-500',
    text: 'text-indigo-900 dark:text-indigo-100',
    accent: 'text-indigo-700 dark:text-indigo-300',
  },
  quiz: {
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    border: 'border-l-violet-500',
    text: 'text-violet-900 dark:text-violet-100',
    accent: 'text-violet-700 dark:text-violet-300',
  },
  orga: {
    bg: 'bg-slate-100 dark:bg-slate-900/60',
    border: 'border-l-slate-500',
    text: 'text-slate-900 dark:text-slate-100',
    accent: 'text-slate-700 dark:text-slate-300',
  },
  special: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-l-amber-500',
    text: 'text-amber-900 dark:text-amber-100',
    accent: 'text-amber-800 dark:text-amber-300',
  },
  break: {
    bg: 'bg-neutral-100 dark:bg-neutral-900/60',
    border: 'border-l-neutral-400',
    text: 'text-neutral-800 dark:text-neutral-200',
    accent: 'text-neutral-600 dark:text-neutral-400',
  },
};

export const templateSchema = z
  .object({
    nom: z
      .string()
      .min(3, 'Le nom doit faire au moins 3 caractères')
      .max(100, 'Le nom ne peut pas dépasser 100 caractères'),
    description: z.string().optional().or(z.literal('')),
    difficulte: z
      .enum(difficultes, {
        message: 'Veuillez sélectionner une difficulté valide',
      })
      .optional()
      .or(z.literal('')),
    activityType: z.enum(activityTypes, {
      message: "Veuillez sélectionner un type d'activité",
    }),
    isDynamic: z.preprocess(
      (val) => val === 'true' || val === true,
      z.boolean().default(false),
    ),
    defaultDuration: z.preprocess(
      (val) =>
        val === '' || val === null || val === undefined
          ? undefined
          : Number(val),
      z
        .number({ message: 'La durée doit être un nombre' })
        .int('La durée doit être un nombre entier')
        .positive('La durée doit être positive')
        .optional(),
    ),
    link: z
      .url("Le format du lien n'est pas valide (https://...)")
      .optional()
      .or(z.literal('')),
    themes: z.array(z.string()).default([]),
    content: z.string().optional().or(z.literal('')),
    contentStructure: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine(
        (val) => {
          if (!val) return true;
          try {
            JSON.parse(val);
            return true;
          } catch {
            return false;
          }
        },
        { message: "Le JSON n'est pas valide" },
      ),
    contentSource: z.enum(['inline_json', 'github']).default('github'),
    repoUrl: z
      .url("L'URL du repo GitHub n'est pas valide (https://github.com/...)")
      .optional()
      .or(z.literal('')),
    ref: z.string().min(1).max(80).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (data.isDynamic) {
      if (data.content) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Le contenu markdown ne doit pas être renseigné pour une activité dynamique',
          path: ['content'],
        });
      }
      if (data.contentSource === 'github') {
        if (!data.repoUrl) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "L'URL du repo GitHub est requise",
            path: ['repoUrl'],
          });
        }
        if (data.contentStructure) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'La structure JSON ne doit pas être renseignée quand la source est GitHub',
            path: ['contentStructure'],
          });
        }
      } else {
        if (!data.contentStructure) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'La structure du contenu est requise pour une activité dynamique',
            path: ['contentStructure'],
          });
        }
        if (data.repoUrl) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "L'URL du repo ne doit pas être renseignée quand la source est JSON",
            path: ['repoUrl'],
          });
        }
      }
    } else {
      if (data.contentStructure) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'La structure JSON ne doit pas être renseignée pour une activité statique',
          path: ['contentStructure'],
        });
      }
      if (data.repoUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "L'URL du repo ne doit pas être renseignée pour une activité statique",
          path: ['repoUrl'],
        });
      }
    }
  });

export type TemplateForm = z.infer<typeof templateSchema>;
