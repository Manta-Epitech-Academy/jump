/**
 * Single source of truth for the onboarding documents a talent signs and how
 * each one maps onto the {@link Talent} record. Consumed by the PDF generator
 * (titles), the PDF job service (where the generated S3 key lands), and the
 * talent-facing "Mes documents" view (which signatures to surface + serve).
 *
 * Keep the doc-type → Talent-column mapping here only: scattering it invites
 * the three consumers to drift (a renamed column fixed in one, missed in
 * another).
 */
import type { Talent } from '@prisma/client';

export type OnboardingDocumentType = 'charter' | 'rules' | 'image-rights';

interface OnboardingDocumentDescriptor {
  /** French title — shared by the PDF header and the talent-facing list. */
  label: string;
  /** Talent column holding the S3 key of the generated PDF. */
  filePathField: 'charterFilePath' | 'rulesFilePath' | 'imageRightsFilePath';
  /** Talent column timestamping the signature this document attests. */
  signedAtField: 'charterAcceptedAt' | 'rulesSignedAt' | 'imageRightsDecidedAt';
}

export const ONBOARDING_DOCUMENTS: Record<
  OnboardingDocumentType,
  OnboardingDocumentDescriptor
> = {
  charter: {
    label: 'Charte Informatique et Éthique',
    filePathField: 'charterFilePath',
    signedAtField: 'charterAcceptedAt',
  },
  rules: {
    label: 'Règlement Intérieur',
    filePathField: 'rulesFilePath',
    signedAtField: 'rulesSignedAt',
  },
  // Neutral label: the same document type backs both an authorization and a
  // refusal. The PDF generator picks the decision-specific title and body.
  'image-rights': {
    label: "Droit à l'Image",
    filePathField: 'imageRightsFilePath',
    signedAtField: 'imageRightsDecidedAt',
  },
};

/**
 * Documents a talent can review from their own settings. The charte is omitted
 * deliberately: it has no generated PDF (only `rules` and `image-rights` are
 * enqueued at signature time), so there is nothing to serve.
 */
export const TALENT_VIEWABLE_DOCUMENTS = [
  'rules',
  'image-rights',
] as const satisfies readonly OnboardingDocumentType[];

export type TalentViewableDocumentType =
  (typeof TALENT_VIEWABLE_DOCUMENTS)[number];

export function isTalentViewableDocument(
  type: string,
): type is TalentViewableDocumentType {
  return (TALENT_VIEWABLE_DOCUMENTS as readonly string[]).includes(type);
}

/**
 * Projects one viewable document's state for the talent, reading the columns
 * named by its descriptor. `signedAt === null` ⇒ never signed (hide it);
 * `ready === false` ⇒ signed but the background PDF job hasn't landed the file
 * yet.
 */
export function projectTalentDocument(
  talent: Talent,
  type: TalentViewableDocumentType,
): {
  type: TalentViewableDocumentType;
  label: string;
  signedAt: Date | null;
  ready: boolean;
} {
  const descriptor = ONBOARDING_DOCUMENTS[type];
  return {
    type,
    label: descriptor.label,
    signedAt: talent[descriptor.signedAtField],
    ready: talent[descriptor.filePathField] !== null,
  };
}
