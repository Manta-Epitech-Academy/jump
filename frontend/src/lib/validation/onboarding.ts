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
  parentPhone: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
});

export const infoValidationSchema = infoBaseSchema
  .refine((data) => data.email !== data.parentEmail, {
    message: "L'email du parent doit être différent de celui de l'enfant",
    path: ['parentEmail'],
  })
  .refine(
    (data) => {
      if (data.phone && data.parentPhone) {
        return data.phone !== data.parentPhone;
      }
      return true;
    },
    {
      message:
        "Le téléphone du parent doit être différent de celui de l'enfant",
      path: ['parentPhone'],
    },
  );

export type InfoValidationForm = z.infer<typeof infoBaseSchema>;
