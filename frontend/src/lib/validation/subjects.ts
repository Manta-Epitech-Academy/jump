import { z } from 'zod';

export const difficultes = ['Débutant', 'Intermédiaire', 'Avancé'] as const;

export const subjectSchema = z.object({
  nom: z
    .string()
    .min(3, 'Le nom doit faire au moins 3 caractères')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères'),
  description: z
    .string()
    .min(10, 'La description doit faire au moins 10 caractères'),
  difficulte: z
    .enum(difficultes, {
      message: 'Veuillez sélectionner une difficulté valide',
    })
    .default('Débutant'),
  themes: z.array(z.string()).default([]),
  link: z
    .url("Le format du lien n'est pas valide (https://...)")
    .optional()
    .or(z.literal('')),
});

export type SubjectForm = z.infer<typeof subjectSchema>;
