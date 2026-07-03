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
  /**
   * Talent column holding the S3 key of the generated PDF. Absent for the
   * charte, which is a checkbox acceptance with no generated document.
   */
  filePathField?: 'rulesFilePath' | 'imageRightsFilePath';
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
// The two arms of "finished", kept as named building blocks for the combined
// `OR` below (the coarse SQL prefilter for "has any finished doc"). The precise
// per-document projection lives in `finishedOnboardingDocsOf`; these only fetch
// candidate rows.
const FINISHED_IMAGE_RIGHTS_WHERE: Prisma.TalentWhereInput = {
  imageRightsDecidedAt: { not: null },
  imageRightsFilePath: { not: null },
};
const FINISHED_RULES_WHERE: Prisma.TalentWhereInput = {
  rulesSignedAt: { not: null },
  parentRulesSignedAt: { not: null },
  rulesFilePath: { not: null },
};

export const FINISHED_ONBOARDING_DOCS_WHERE: Prisma.TalentWhereInput = {
  OR: [FINISHED_IMAGE_RIGHTS_WHERE, FINISHED_RULES_WHERE],
};

/** Document kinds the bulk export can package (the charte has no PDF). */
export type ExportableDocumentType = Extract<
  OnboardingDocumentType,
  'rules' | 'image-rights'
>;

export function isExportableDocumentType(
  type: string,
): type is ExportableDocumentType {
  return type === 'rules' || type === 'image-rights';
}

/** Inclusive completion-time window for scoping an export or a count. */
export interface DateRange {
  /** Keep docs finished at or after this instant. */
  from?: Date;
  /** Keep docs finished at or before this instant. */
  to?: Date;
}

function inRange(at: Date, { from, to }: DateRange): boolean {
  if (from && at < from) return false;
  if (to && at > to) return false;
  return true;
}

/** The Talent columns the "finished" projection reads. */
type TalentFinishedFields = Pick<
  Talent,
  | 'imageRightsDecidedAt'
  | 'imageRightsFilePath'
  | 'rulesSignedAt'
  | 'parentRulesSignedAt'
  | 'rulesFilePath'
>;

const FINISHED_FIELDS_SELECT = {
  imageRightsDecidedAt: true,
  imageRightsFilePath: true,
  rulesSignedAt: true,
  parentRulesSignedAt: true,
  rulesFilePath: true,
} satisfies Prisma.TalentSelect;

/** One finished document with the instant it became legally complete. */
export interface FinishedOnboardingDocTime {
  type: ExportableDocumentType;
  /**
   * When the document became legally complete: the guardian's decision for
   * droit à l'image, and the LATER of the two required signatures (student +
   * guardian co-sign) for the règlement.
   */
  finishedAt: Date;
}

/**
 * Single source of truth for WHICH of a talent's onboarding docs are finished
 * and WHEN each completed. {@link FINISHED_ONBOARDING_DOCS_WHERE} is the coarse
 * SQL prefilter that fetches candidate rows; this is the exact per-document
 * projection (it also resolves the règlement's max-of-two-signatures instant,
 * which the SQL gate can't express). Keep the two in step.
 */
export function finishedOnboardingDocsOf(
  t: TalentFinishedFields,
): FinishedOnboardingDocTime[] {
  const out: FinishedOnboardingDocTime[] = [];
  if (t.imageRightsDecidedAt && t.imageRightsFilePath) {
    out.push({ type: 'image-rights', finishedAt: t.imageRightsDecidedAt });
  }
  if (t.rulesSignedAt && t.parentRulesSignedAt && t.rulesFilePath) {
    out.push({
      type: 'rules',
      finishedAt:
        t.parentRulesSignedAt > t.rulesSignedAt
          ? t.parentRulesSignedAt
          : t.rulesSignedAt,
    });
  }
  return out;
}

/**
 * Completion timeline of every finished onboarding document across all talents:
 * one `{ type, finishedAt }` per file, nothing identifying. Feeds the admin
 * page's per-period / per-type download counts, computed client-side from this
 * one list so every bucket (and any custom range) stays consistent.
 */
export async function loadFinishedOnboardingTimeline(): Promise<
  FinishedOnboardingDocTime[]
> {
  const talents = await prisma.talent.findMany({
    where: FINISHED_ONBOARDING_DOCS_WHERE,
    select: FINISHED_FIELDS_SELECT,
  });
  return talents.flatMap(finishedOnboardingDocsOf);
}

/**
 * Advances an admin's onboarding-PDF archival high-water mark to `at`, the
 * instant a full "everything up to now" archive was snapshotted. The admin page
 * reads this back as `lastExportAt` to offer the "depuis le dernier export"
 * delta (docs finished at/after the mark).
 *
 * `at` is the export's pre-snapshot instant, never a later stream-completion
 * time: a doc that finishes mid-export then stays at/after the mark and is
 * re-offered next time, so the delta can only ever re-include a doc (a harmless
 * duplicate), never silently skip one. Best-effort: a failed write just leaves
 * the mark where it was, so the next export re-includes already-grabbed docs.
 */
export async function recordOnboardingDocsExport(
  staffProfileId: string,
  at: Date,
): Promise<void> {
  await prisma.staffProfile.update({
    where: { id: staffProfileId },
    data: { onboardingDocsExportedAt: at },
  });
}

export interface FinishedOnboardingDoc extends FinishedOnboardingDocTime {
  /** S3 key of the stored PDF. */
  key: string;
  /** Per-file download name, e.g. `imagerights-jeandupont-A12345.pdf`. */
  filename: string;
}

/**
 * Collects finished onboarding documents across all talents (global, matching
 * the admin scope), one {@link FinishedOnboardingDoc} per file, enriched with
 * the storage key + download filename. Optionally scoped by document kind and/or
 * completion-time window for a partial export. Built on
 * {@link finishedOnboardingDocsOf} so "finished" means the same here as in the
 * page's counts.
 */
export async function collectFinishedOnboardingDocs(filter?: {
  onlyType?: ExportableDocumentType;
  range?: DateRange;
}): Promise<FinishedOnboardingDoc[]> {
  const { onlyType, range } = filter ?? {};
  const talents = await prisma.talent.findMany({
    where: FINISHED_ONBOARDING_DOCS_WHERE,
    select: {
      id: true,
      prenom: true,
      nom: true,
      externalId: true,
      ...FINISHED_FIELDS_SELECT,
    },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
  });

  const docs: FinishedOnboardingDoc[] = [];
  for (const t of talents) {
    for (const doc of finishedOnboardingDocsOf(t)) {
      if (onlyType && doc.type !== onlyType) continue;
      if (range && !inRange(doc.finishedAt, range)) continue;
      // Non-null: `finishedOnboardingDocsOf` only emits a kind once its file
      // path column is set.
      const key =
        doc.type === 'image-rights' ? t.imageRightsFilePath! : t.rulesFilePath!;
      docs.push({
        ...doc,
        key,
        filename: onboardingDownloadFilename(doc.type, t),
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
  // Accepts the session talent (`locals.talent`); reads only the document
  // signed-at / file-path fields.
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
    ready: descriptor.filePathField
      ? talent[descriptor.filePathField] !== null
      : false,
  };
}
