import { isValidPhoneNumber } from 'libphonenumber-js';
import { z } from 'zod';

const civiliteEnum = z.enum(['homme', 'femme', 'autre'], {
  message: 'La civilité est requise',
});

const parentTypeEnum = z.enum(['pere', 'mere', 'referent'], {
  message: 'Le lien de parenté est requis',
});

const phoneSchema = z
  .string()
  .min(1, 'Le numéro de téléphone est requis')
  .refine((val) => isValidPhoneNumber(val), {
    message: 'Numéro de téléphone invalide',
  });

// A Bits UI `<Checkbox name=… value="true" />` follows native checkbox submit
// semantics: it sends `"true"` when checked and omits the field entirely when
// unchecked. Parse that explicitly — never `z.coerce.boolean()`, which maps any
// non-empty string (including the literal `"false"`) to `true`.
// A consent box that must be ticked: the field is absent until checked, so a
// plain required literal rejects an unchecked box with the given message.
const requiredConsent = (message: string) => z.literal('true', { message });

const optionalPhoneSchema = z
  .string()
  .optional()
  .refine((val) => !val || val === '' || isValidPhoneNumber(val), {
    message: 'Numéro de téléphone invalide',
  });

const parent2Schema = z.object({
  parent2Type: z.string().optional(),
  parent2Civilite: z.string().optional(),
  parent2Nom: z.string().optional(),
  parent2Prenom: z.string().optional(),
  parent2Email: z.string().optional(),
  parent2Phone: optionalPhoneSchema,
});

// --- Étape 1 : Identité ---
// Email is intentionally absent: it's the talent's account/login identity
// (OTP), owned by `bauth_user` and immutable from onboarding. The step shows it
// read-only for trust; it's never submitted or persisted here.
export const identitySchema = z.object({
  civilite: civiliteEnum,
  nom: z.string().min(2, 'Le nom doit faire au moins 2 caractères').trim(),
  prenom: z
    .string()
    .min(2, 'Le prénom doit faire au moins 2 caractères')
    .trim(),
  phone: phoneSchema,
});

// --- Étape 2 : Lycée ---
export const schoolSchema = z.object({
  // School is identified by its national UAI when picked from the annuaire;
  // `schoolName`/`schoolCity` carry the display values (and are the only signal
  // for the free-text fallback, when no UAI is available).
  schoolUai: z.string().optional().or(z.literal('')),
  schoolName: z.string().min(2, 'Le nom du lycée est requis').trim(),
  schoolCity: z.string().optional().or(z.literal('')),
});

// --- Étape 3 : Référents ---
export const parentsSchema = z
  .object({
    // studentEmail / studentPhone are injected server-side from the talent's
    // already-confirmed identity — they only feed the parent-vs-student checks.
    studentEmail: z.email(),
    studentPhone: optionalPhoneSchema,
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
    parentPhone: phoneSchema,
  })
  .merge(parent2Schema)
  .refine((data) => data.studentEmail !== data.parentEmail, {
    message: "L'email du parent doit être différent de celui de l'enfant",
    path: ['parentEmail'],
  })
  .refine(
    (data) => !data.studentPhone || data.studentPhone !== data.parentPhone,
    {
      message:
        "Le téléphone du parent doit être différent de celui de l'enfant",
      path: ['parentPhone'],
    },
  )
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
      return data.parent2Email !== data.studentEmail;
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

export type IdentityForm = z.infer<typeof identitySchema>;
export type SchoolForm = z.infer<typeof schoolSchema>;
export type ParentsForm = z.infer<typeof parentsSchema>;

// --- Étape 4 & 5 : Intérêts et Matériel ---
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
  // A working laptop is a hard prerequisite for the stage, so the box must be
  // ticked to advance — enforced here, not only by the disabled CTA. Kept as a
  // boolean column, hence the literal + transform rather than `requiredConsent`.
  hasLaptop: z
    .literal('true', {
      message: 'Tu dois posséder un laptop fonctionnel pour continuer.',
    })
    .transform(() => true),
  setupDescription: z
    .string()
    .max(1000, 'Maximum 1000 caractères')
    .optional()
    .or(z.literal('')),
});

// --- Étape 7 : Règlement intérieur & confidentialité ---
// Both consents are legally load-bearing (RGPD, minors), so they are enforced
// server-side here, not merely by the disabled submit button on the client.
export const rulesSchema = z.object({
  city: z.string().trim().min(1, 'Veuillez indiquer la ville.'),
  acceptedCharter: requiredConsent(
    'Vous devez accepter la politique de confidentialité pour continuer.',
  ),
  acceptedRules: requiredConsent(
    'Vous devez accepter le règlement intérieur pour continuer.',
  ),
});
