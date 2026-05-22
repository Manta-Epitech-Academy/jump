import { z } from 'zod';

const civiliteEnum = z.enum(['homme', 'femme', 'autre'], {
  message: 'La civilité est requise',
});

const parentTypeEnum = z.enum(['pere', 'mere', 'referent'], {
  message: 'Le lien de parenté est requis',
});

const parent2Schema = z.object({
  parent2Type: z.string().optional(),
  parent2Civilite: z.string().optional(),
  parent2Nom: z.string().optional(),
  parent2Prenom: z.string().optional(),
  parent2Email: z.string().optional(),
  parent2Phone: z.string().optional(),
});

const profileBaseSchema = z
  .object({
    civilite: civiliteEnum,
    nom: z.string().min(2, 'Le nom doit faire au moins 2 caractères').trim(),
    prenom: z
      .string()
      .min(2, 'Le prénom doit faire au moins 2 caractères')
      .trim(),
    email: z.email('Email invalide'),
    phone: z.string().min(10, 'Ton numéro est requis'),
    parentType: parentTypeEnum,
    parentCivilite: civiliteEnum,
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
    highSchoolName: z.string().min(2, 'Le nom du lycée est requis').trim(),
    highSchoolCity: z.string().optional().or(z.literal('')),
    highSchoolUai: z.string().optional().or(z.literal('')),
  })
  .merge(parent2Schema);

export const profileSchema = profileBaseSchema
  .refine((data) => data.email !== data.parentEmail, {
    message: "L'email du parent doit être différent de celui de l'enfant",
    path: ['parentEmail'],
  })
  .refine((data) => data.phone !== data.parentPhone, {
    message: "Le téléphone du parent doit être différent de celui de l'enfant",
    path: ['parentPhone'],
  })
  .refine(
    (data) => {
      const hasAny = data.parent2Nom || data.parent2Prenom || data.parent2Email;
      if (!hasAny) return true;
      return (
        !!data.parent2Type &&
        data.parent2Type !== '' &&
        !!data.parent2Civilite &&
        data.parent2Civilite !== '' &&
        !!data.parent2Nom &&
        data.parent2Nom.length >= 2 &&
        !!data.parent2Prenom &&
        data.parent2Prenom.length >= 2 &&
        !!data.parent2Email &&
        data.parent2Email.includes('@')
      );
    },
    {
      message:
        "Si un second parent est renseigné, le type, la civilité, le nom, le prénom et l'email sont obligatoires",
      path: ['parent2Nom'],
    },
  )
  .refine(
    (data) => {
      if (!data.parent2Email || data.parent2Email === '') return true;
      return data.parent2Email !== data.email;
    },
    {
      message:
        "L'email du second parent doit être différent de celui de l'enfant",
      path: ['parent2Email'],
    },
  )
  .refine(
    (data) => {
      if (!data.parent2Email || data.parent2Email === '') return true;
      return data.parent2Email !== data.parentEmail;
    },
    {
      message:
        "L'email du second parent doit être différent de celui du premier parent",
      path: ['parent2Email'],
    },
  );

export type ProfileForm = z.infer<typeof profileBaseSchema>;

export const interestsSchema = z.object({
  techInterestIds: z
    .array(z.string().cuid())
    .min(1, 'Choisis au moins 1 domaine tech')
    .max(2, '2 domaines tech maximum'),
  generalInterestIds: z
    .array(z.string().cuid())
    .min(1, "Choisis au moins 1 centre d'intérêt")
    .max(3, "3 centres d'intérêt maximum"),
  freeText: z
    .string()
    .max(500, 'Maximum 500 caractères')
    .optional()
    .or(z.literal('')),
});

export const equipmentSchema = z.object({
  hasLaptop: z.coerce.boolean(),
  setupDescription: z
    .string()
    .max(1000, 'Maximum 1000 caractères')
    .optional()
    .or(z.literal('')),
});
