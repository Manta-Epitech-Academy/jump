import { z } from 'zod';

const infoBaseSchema = z.object({
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
  parentPhone: z.string().min(10, 'Le numéro du parent est requis'),
  phone: z.string().min(10, 'Ton numéro est requis'),
});

export const infoValidationSchema = infoBaseSchema
  .refine((data) => data.email !== data.parentEmail, {
    message: "L'email du parent doit être différent de celui de l'enfant",
    path: ['parentEmail'],
  })
  .refine((data) => data.phone !== data.parentPhone, {
    message: "Le téléphone du parent doit être différent de celui de l'enfant",
    path: ['parentPhone'],
  });

export type InfoValidationForm = z.infer<typeof infoBaseSchema>;

export const lyceeSchema = z.object({
  highSchoolName: z.string().min(2, 'Le nom du lycée est requis').trim(),
  highSchoolCity: z.string().optional().or(z.literal('')),
});

export const techInterestsSchema = z.object({
  interestIds: z
    .array(z.string().cuid())
    .min(1, 'Choisis au moins 1 domaine tech')
    .max(2, '2 domaines tech maximum'),
});

export const generalInterestsSchema = z.object({
  interestIds: z
    .array(z.string().cuid())
    .min(1, "Choisis au moins 1 centre d'intérêt")
    .max(5, "5 centres d'intérêt maximum"),
});
