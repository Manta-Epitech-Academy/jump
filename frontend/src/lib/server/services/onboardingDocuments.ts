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
import type { Prisma, Talent } from '@prisma/client';
import { prisma } from '$lib/server/db';

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
 *               chars of the talent id, so homonyms' filenames stay distinct.
 * Pure ASCII, so it needs no RFC 5987 Content-Disposition encoding. The `who`
 * segment is dropped when a name slugifies to empty (fully non-Latin), leaving
 * a clean `{slug}-{tag}.pdf` rather than a stray double hyphen.
 */
export function onboardingDownloadFilename(
  type: OnboardingDocumentType,
  talent: Pick<Talent, 'prenom' | 'nom' | 'externalId' | 'id'>,
): string {
  const slug = ONBOARDING_DOCUMENTS[type].downloadSlug;
  const who = `${slugifyAscii(talent.prenom)}${slugifyAscii(talent.nom)}`;
  const tag = sanitizeTag(talent.externalId ?? talent.id.slice(0, 8));
  return `${[slug, who, tag].filter(Boolean).join('-')}.pdf`;
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
 * A talent's "finished" onboarding documents are EITHER:
 *   - the image-rights PDF, once the legal guardian has decided either way
 *     (authorization OR refusal both produce a legal PDF worth archiving), OR
 *   - the règlement intérieur PDF, ONLY once it is co-signed by BOTH the talent
 *     (`rulesSignedAt`) AND the parent (`parentRulesSignedAt`). The règlement is
 *     a single artifact carrying both signature blocks, so the two-signature
 *     gate guards that one file: a talent-only-signed règlement never matches.
 * Each arm also requires the generated PDF to exist on the row (`*FilePath`).
 * Shared by the bulk-export endpoint and the page that gates its button so the
 * filter can never drift between the two.
 */
export const FINISHED_ONBOARDING_DOCS_WHERE: Prisma.TalentWhereInput = {
  OR: [
    { imageRightsDecidedAt: { not: null }, imageRightsFilePath: { not: null } },
    {
      rulesSignedAt: { not: null },
      parentRulesSignedAt: { not: null },
      rulesFilePath: { not: null },
    },
  ],
};

export interface FinishedOnboardingDoc {
  /** S3 key of the stored PDF. */
  key: string;
  type: Extract<OnboardingDocumentType, 'rules' | 'image-rights'>;
  /** Per-file download name, e.g. `imagerights-jeandupont-A12345.pdf`. */
  filename: string;
}

/**
 * Collects every finished onboarding document across all talents (global,
 * matching the admin scope), expanded to one {@link FinishedOnboardingDoc} per
 * file. A talent can contribute both an image-rights and a règlement file, so
 * each arm is re-checked independently rather than trusting which OR-branch of
 * {@link FINISHED_ONBOARDING_DOCS_WHERE} matched the row.
 */
export async function collectFinishedOnboardingDocs(): Promise<
  FinishedOnboardingDoc[]
> {
  const talents = await prisma.talent.findMany({
    where: FINISHED_ONBOARDING_DOCS_WHERE,
    select: {
      id: true,
      prenom: true,
      nom: true,
      externalId: true,
      imageRightsDecidedAt: true,
      imageRightsFilePath: true,
      rulesSignedAt: true,
      parentRulesSignedAt: true,
      rulesFilePath: true,
    },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });

  const docs: FinishedOnboardingDoc[] = [];
  for (const t of talents) {
    if (t.imageRightsDecidedAt && t.imageRightsFilePath) {
      docs.push({
        key: t.imageRightsFilePath,
        type: 'image-rights',
        filename: onboardingDownloadFilename('image-rights', t),
      });
    }
    if (t.rulesSignedAt && t.parentRulesSignedAt && t.rulesFilePath) {
      docs.push({
        key: t.rulesFilePath,
        type: 'rules',
        filename: onboardingDownloadFilename('rules', t),
      });
    }
  }
  return docs;
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
 * Narrows a free-form string (e.g. the `OnboardingPdfJob.documentType` column,
 * which is typed `String` in the schema) to a known document type. Use at the
 * boundary instead of an unchecked `as OnboardingDocumentType` cast so a stray
 * value degrades to a clear branch rather than a runtime read of `undefined`.
 */
export function isOnboardingDocumentType(
  type: string,
): type is OnboardingDocumentType {
  return Object.hasOwn(ONBOARDING_DOCUMENTS, type);
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
