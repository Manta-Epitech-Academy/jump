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
  /** Lowercase ASCII slug used as the first segment of the download filename. */
  downloadSlug: 'charter' | 'rules' | 'imagerights';
}

export const ONBOARDING_DOCUMENTS: Record<
  OnboardingDocumentType,
  OnboardingDocumentDescriptor
> = {
  charter: {
    label: 'Charte Informatique et Éthique',
    filePathField: 'charterFilePath',
    signedAtField: 'charterAcceptedAt',
    downloadSlug: 'charter',
  },
  // Shared règlement intérieur PDF — single artifact carrying the student's
  // signature block and (for minors) the legal guardian's co-signature block.
  // The worker regenerates it whenever either signer commits, reading both
  // signature columns from Talent so the file always reflects current state.
  rules: {
    label: 'Règlement Intérieur',
    filePathField: 'rulesFilePath',
    signedAtField: 'rulesSignedAt',
    downloadSlug: 'rules',
  },
  // Neutral label: the same document type backs both an authorization and a
  // refusal. The PDF generator picks the decision-specific title and body.
  'image-rights': {
    label: "Droit à l'Image",
    filePathField: 'imageRightsFilePath',
    signedAtField: 'imageRightsDecidedAt',
    downloadSlug: 'imagerights',
  },
};

/**
 * Build a human, unique download filename for a generated onboarding PDF:
 *   {slug}-{prenomnom}-{tag}.pdf
 *     slug      charter | rules | imagerights
 *     prenomnom lowercased, accent-stripped, alphanumerics only (concatenated)
 *     tag       Talent.externalId (Salesforce id) when set, else the first 8
 *               chars of the talent id — guarantees uniqueness across homonyms.
 * Pure ASCII, so it needs no RFC 5987 Content-Disposition encoding.
 */
export function onboardingDownloadFilename(
  type: OnboardingDocumentType,
  talent: Pick<Talent, 'prenom' | 'nom' | 'externalId' | 'id'>,
): string {
  const slug = ONBOARDING_DOCUMENTS[type].downloadSlug;
  const who = `${slugifyAscii(talent.prenom)}${slugifyAscii(talent.nom)}`;
  const tag = sanitizeTag(talent.externalId ?? talent.id.slice(0, 8));
  return `${slug}-${who}-${tag}.pdf`;
}

function slugifyAscii(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // keep alphanumerics only
}

function sanitizeTag(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '');
}

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
