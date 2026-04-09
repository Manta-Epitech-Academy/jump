import { z } from 'zod';
import { m } from '$lib/paraglide/messages.js';

export const difficultes = ['Débutant', 'Intermédiaire', 'Avancé'] as const;

export const subjectSchema = z.object({
  nom: z
    .string()
    .min(3, { error: () => m.validation_min_length({ min: 3 }) })
    .max(100, { error: () => m.validation_max_length({ max: 100 }) }),
  description: z
    .string()
    .min(10, { error: () => m.validation_min_length({ min: 10 }) }),
  difficulte: z
    .enum(difficultes, { error: () => m.validation_difficulte_required() })
    .default('Débutant'),
  themes: z.array(z.string()).default([]),
  link: z
    .url({ error: () => m.validation_url_invalid() })
    .optional()
    .or(z.literal('')),
});

export type SubjectForm = z.infer<typeof subjectSchema>;
