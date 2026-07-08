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

// Emails are stored lowercased/trimmed, so uniqueness has to compare on the
// same normalized form — otherwise a case-only difference passes the check here
// and then collides on save.
const normEmail = (v: string | null | undefined): string =>
  (v ?? '').trim().toLowerCase();

// Parent 2 is optional, but the moment the talent fills any of its fields the
// referent is "being added", so the mandatory set becomes required.
type Parent2Fields = {
  parent2Type?: string;
  parent2Civilite?: string;
  parent2Nom?: string;
  parent2Prenom?: string;
  parent2Email?: string;
  parent2Phone?: string;
};
const parent2Engaged = (d: Parent2Fields): boolean =>
  Boolean(
    d.parent2Type ||
    d.parent2Civilite ||
    d.parent2Nom ||
    d.parent2Prenom ||
    d.parent2Email ||
    d.parent2Phone,
  );

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
  .extend(parent2Schema.shape)
  .refine(
    (data) => normEmail(data.parentEmail) !== normEmail(data.studentEmail),
    {
      message: "L'email du parent doit être différent de celui de l'enfant",
      path: ['parentEmail'],
    },
  )
  .refine(
    (data) => !data.studentPhone || data.studentPhone !== data.parentPhone,
    {
      message:
        "Le téléphone du parent doit être différent de celui de l'enfant",
      path: ['parentPhone'],
    },
  )
  // Parent 2 mandatory set, once engaged — one refine per field so each error
  // lands on its own path and renders next to its input. The old single refine
  // pinned every case to `parent2Nom`, so a missing type/civilité/prénom/email
  // wrote to a path with no message and read as a silent "nothing happened".
  .refine((data) => !parent2Engaged(data) || !!data.parent2Type, {
    message: 'Le lien de parenté est requis',
    path: ['parent2Type'],
  })
  .refine((data) => !parent2Engaged(data) || !!data.parent2Civilite, {
    message: 'La civilité est requise',
    path: ['parent2Civilite'],
  })
  .refine(
    (data) =>
      !parent2Engaged(data) ||
      (!!data.parent2Prenom && data.parent2Prenom.trim().length >= 2),
    {
      message: 'Le prénom du parent doit faire au moins 2 caractères',
      path: ['parent2Prenom'],
    },
  )
  .refine(
    (data) =>
      !parent2Engaged(data) ||
      (!!data.parent2Nom && data.parent2Nom.trim().length >= 2),
    {
      message: 'Le nom du parent doit faire au moins 2 caractères',
      path: ['parent2Nom'],
    },
  )
  .refine(
    (data) =>
      !parent2Engaged(data) ||
      (!!data.parent2Email && z.email().safeParse(data.parent2Email).success),
    {
      message: 'Email parent invalide',
      path: ['parent2Email'],
    },
  )
  .refine(
    (data) => {
      const p2 = normEmail(data.parent2Email);
      return !p2 || p2 !== normEmail(data.studentEmail);
    },
    {
      message:
        "L'email du second parent doit être différent de celui de l'enfant",
      path: ['parent2Email'],
    },
  )
  .refine(
    (data) => {
      const p2 = normEmail(data.parent2Email);
      return !p2 || p2 !== normEmail(data.parentEmail);
    },
    {
      message:
        "L'email du second parent doit être différent de celui du premier parent",
      path: ['parent2Email'],
    },
  );

// --- Étape 4 & 5 : Intérêts et Matériel ---
export const interestsSchema = z.object({
  // IDs are internal cuid v1 keys, but the action count-checks each against the
  // DB (interest.count must equal the submitted length), so a plain string is
  // enough — no point in Zod's now-deprecated cuid v1 format check.
  techInterestIds: z
    .array(z.string())
    .min(1, 'Choisis au moins 1 domaine tech')
    .max(2, '2 domaines tech maximum'),
  generalInterestIds: z
    .array(z.string())
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
