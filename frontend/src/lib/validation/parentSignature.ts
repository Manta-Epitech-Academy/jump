import { z } from 'zod';
import {
  SIGNER_RELATIONSHIPS,
  type SignerRelationship,
} from '#lib/domain/profile.ts';
import {
  IMAGE_RIGHTS_DECISIONS,
  type ImageRightsDecision,
} from '#lib/domain/imageRights.ts';

/**
 * The two acts a guardian signs for their child, the règlement intérieur and
 * the droit à l'image, as one schema each over the same signer block. The
 * three actions that take a signature (`parent/reglement`, `parent/signature`,
 * `parent/enfant/[talentId]`) validate through these and nothing else: they
 * used to read the form by hand and restate the checks, and the server never
 * checked that the règlement was accepted, or that the relationship was one the
 * form offers before printing it in the signed PDF.
 */

/**
 * A choice the guardian has to make themselves. Superforms would otherwise
 * default an enum to its first value, which for the image-rights decision is a
 * pre-ticked consent, and would fill that value in for a POST that left the
 * field out.
 */
function requiredChoice<const T extends readonly [string, ...string[]]>(
  values: T,
  message: string,
) {
  return z
    .enum(values)
    .nullable()
    .default(null)
    .refine((v) => v !== null, { message });
}

/** A line of the declaration the guardian types: their name, their city. */
const typed = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .max(100, 'Ce champ est trop long (100 caractères au plus).');

const signerFields = {
  talentId: z.string().min(1),
  signerPrenom: typed('Veuillez entrer votre prénom.'),
  signerNom: typed('Veuillez entrer votre nom.'),
  relationship: requiredChoice(
    SIGNER_RELATIONSHIPS,
    'Veuillez indiquer votre qualité (mère, père, tuteur légal, tutrice légale).',
  ),
  city: typed('Veuillez indiquer la ville.'),
};

export const parentRulesSignatureSchema = z.object({
  ...signerFields,
  accepted: z
    .boolean()
    .refine(Boolean, 'Veuillez accepter le règlement intérieur.'),
});

export const imageRightsSignatureSchema = z.object({
  ...signerFields,
  decision: requiredChoice(
    IMAGE_RIGHTS_DECISIONS,
    "Veuillez choisir d'autoriser ou de refuser le droit à l'image.",
  ),
});

export type ParentRulesSignatureSchema = typeof parentRulesSignatureSchema;
export type ImageRightsSignatureSchema = typeof imageRightsSignatureSchema;
export type ParentSignerFields = z.infer<z.ZodObject<typeof signerFields>>;

/**
 * The signer block of a validated form, as the services take it. The schema
 * already refused a missing relationship; this is where the type learns it.
 */
export function signerOf(data: ParentSignerFields): {
  signerPrenom: string;
  signerNom: string;
  relationship: SignerRelationship;
  city: string;
} {
  const { signerPrenom, signerNom, relationship, city } = data;
  if (relationship === null) throw new Error('relationship was not validated');
  return { signerPrenom, signerNom, relationship, city };
}

/** The decision of a validated image-rights form, likewise. */
export function decisionOf(data: {
  decision: ImageRightsDecision | null;
}): ImageRightsDecision {
  if (data.decision === null) throw new Error('decision was not validated');
  return data.decision;
}

/**
 * The id of one child's signature form for one act. A page lists one form per
 * child, and superforms routes an action's answer back to the form whose id it
 * carries, so the id names both.
 */
export const parentSignatureFormId = (
  act: 'rules' | 'image-rights',
  talentId: string,
): string => `${act}:${talentId}`;
