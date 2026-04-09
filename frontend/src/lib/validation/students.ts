import { z } from 'zod';
import { m } from '$lib/paraglide/messages.js';

export const difficultes = ['Débutant', 'Intermédiaire', 'Avancé'] as const;

export const studentSchema = z.object({
  nom: z
    .string()
    .min(2, { error: () => m.validation_min_length({ min: 2 }) })
    .trim(),
  prenom: z
    .string()
    .min(2, { error: () => m.validation_min_length({ min: 2 }) })
    .trim(),
  email: z
    .email({ error: () => m.validation_email_invalid() })
    .optional()
    .or(z.literal('')),
  phone: z.string().optional(),
  niveau: z.enum(
    ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale', 'Sup'],
    { error: () => m.validation_niveau_required() },
  ),
  niveau_difficulte: z.enum(difficultes).default('Débutant'),
  parent_email: z
    .email({ error: () => m.validation_email_parent_invalid() })
    .optional()
    .or(z.literal('')),
  parent_phone: z.string().optional(),
});

export type StudentForm = z.infer<typeof studentSchema>;
