import { z } from 'zod';

export const infoValidationSchema = z.object({
  nom: z.string().min(2, 'Le nom doit faire au moins 2 caractères').trim(),
  prenom: z
    .string()
    .min(2, 'Le prénom doit faire au moins 2 caractères')
    .trim(),
  email: z.email('Email invalide'),
  parentNom: z
    .string()
    .min(2, 'Le nom du parent doit faire au moins 2 caractères')
    .trim(),
  parentPrenom: z
    .string()
    .min(2, 'Le prénom du parent doit faire au moins 2 caractères')
    .trim(),
  parentEmail: z.email('Email parent invalide'),
  parentPhone: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
});

export type InfoValidationForm = z.infer<typeof infoValidationSchema>;
