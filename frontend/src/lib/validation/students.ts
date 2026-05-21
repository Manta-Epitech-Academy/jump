import { z } from 'zod';
import { NIVEAUX } from '$lib/domain/niveau';

export const studentSchema = z.object({
  nom: z.string().min(2, 'Le nom doit faire au moins 2 caractères').trim(),
  prenom: z
    .string()
    .min(2, 'Le prénom doit faire au moins 2 caractères')
    .trim(),
  email: z.email('Email invalide').optional().or(z.literal('')),
  phone: z.string().optional(),
  niveau: z.enum(NIVEAUX, {
    message: 'Veuillez sélectionner un niveau scolaire valide',
  }),
  parent_email: z.email('Email parent invalide').optional().or(z.literal('')),
  parent_phone: z.string().optional(),
  parent_nom: z.string().optional(),
  parent_prenom: z.string().optional(),
});

export type StudentForm = z.infer<typeof studentSchema>;
