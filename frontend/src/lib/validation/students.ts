import { z } from 'zod';

export const difficultes = ['Débutant', 'Intermédiaire', 'Avancé'] as const;

export const studentSchema = z.object({
  nom: z.string().min(2, 'Le nom doit faire au moins 2 caractères').trim(),
  prenom: z
    .string()
    .min(2, 'Le prénom doit faire au moins 2 caractères')
    .trim(),
  email: z.email('Email invalide').optional().or(z.literal('')),
  phone: z.string().optional(),
  niveau: z.enum(
    ['6eme', '5eme', '4eme', '3eme', '2nde', '1ere', 'Terminale', 'Sup'],
    {
      message: 'Veuillez sélectionner un niveau scolaire valide',
    },
  ),
  niveau_difficulte: z.enum(difficultes).default('Débutant'),
  parent_email: z.email('Email parent invalide').optional().or(z.literal('')),
  parent_phone: z.string().optional(),
});

export type StudentForm = z.infer<typeof studentSchema>;
