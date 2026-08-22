/**
 * Single source of truth for the onboarding documents a talent signs, and for
 * which record each one lives on. Consumed by the PDF generator (titles), the
 * PDF job service (where the generated S3 key lands), the talent-facing "Mes
 * documents" view, and the staff archive export.
 *
 * Two records hold documents, and the difference is the thing to keep straight:
 * the charte and the image-rights decision are once-per-account and live on
 * `Talent`, while the règlement is signed once per school year and lives on the
 * matching `Onboarding_Record` - signature, co-signature and rendered PDF
 * together. A talent therefore has ONE image-rights document and one règlement
 * per year they walked, which is why the reads here return lists rather than one
 * row per document kind.
 *
 * Keep that mapping here only: scattering it invites the consumers to drift, and
 * the last time it drifted the règlement kept resolving to a single per-talent
 * artifact after it had become annual.
 */
import type { Prisma, Talent } from '@prisma/client';
import { prisma } from '$lib/server/db';

export type OnboardingDocumentType = 'charter' | 'rules' | 'image-rights';

interface OnboardingDocumentDescriptor {
  /** French title — shared by the PDF header and the talent-facing list. */
  label: string;
  /**
   * Which record carries this kind's signature and its rendered PDF.
   *
   * `account` — signed at most once per talent, so the columns live on `Talent`
   * (the charte, the image-rights decision).
   *
   * `dossier` — signed once per school year, so both the signature and the
   * render live on the matching `Onboarding_Record` (the règlement intérieur).
   *
   * Named rather than expressed as a column name, which is what the descriptor
   * used to hold: a single `filePathField` string forced every kind onto a
   * `Talent` column, and that is how the règlement kept pointing at one
   * per-talent artifact after it became annual, so year two's render overwrote
   * year one's. The two records spell these columns differently and a document
   * kind now says which record to ask.
   */
  scope: 'account' | 'dossier';
  /**
   * Talent column holding the S3 key of the generated PDF, for `account`-scoped
   * kinds only. Absent for the charte, which is a checkbox acceptance with no
   * generated document, and for the règlement, whose key is on the dossier.
   */
  filePathField?: 'imageRightsFilePath';
  /** Lowercase ASCII slug used as the first segment of the download filename. */
  downloadSlug: 'charter' | 'rules' | 'imagerights';
}

export const ONBOARDING_DOCUMENTS: Record<
  OnboardingDocumentType,
  OnboardingDocumentDescriptor
> = {
  charter: {
    label: 'Charte Informatique et Éthique',
    scope: 'account',
    downloadSlug: 'charter',
  },
  // Shared règlement intérieur PDF — one artifact per school year, carrying the
  // student's signature block and (for minors) the legal guardian's co-signature
  // block. The worker regenerates it whenever either signer commits, reading both
  // signature columns from that year's dossier so the file always reflects the
  // state of the year it belongs to.
  rules: {
    label: 'Règlement Intérieur',
    scope: 'dossier',
    downloadSlug: 'rules',
  },
  // Neutral label: the same document type backs both an authorization and a
  // refusal. The PDF generator picks the decision-specific title and body.
  'image-rights': {
    label: "Droit à l'Image",
    scope: 'account',
    filePathField: 'imageRightsFilePath',
    downloadSlug: 'imagerights',
  },
};

/**
 * Build a human, unique download filename for a generated onboarding PDF:
 *   {slug}-{year}-{prenomnom}-{tag}.pdf
 *     slug      charter | rules | imagerights
 *     year      school year of the dossier, for a per-year document only
 *     prenomnom lowercased, accent-stripped, alphanumerics only (concatenated)
 *     tag       Talent.externalId (Salesforce id) when set, else the first 8
 *               chars of the talent id, so homonyms' filenames stay distinct.
 * Pure ASCII, so it needs no RFC 5987 Content-Disposition encoding. Any segment
 * that resolves to empty is dropped (a name that slugifies away, a document with
 * no year), leaving a clean join rather than a stray double hyphen.
 *
 * The year is what keeps a returning talent's two règlements apart: without it
 * both land in a bulk export under one name, and a zip entry silently replaces
 * the other.
 */
export function onboardingDownloadFilename(
  type: OnboardingDocumentType,
  talent: Pick<Talent, 'prenom' | 'nom' | 'externalId' | 'id'>,
  schoolYear?: string | null,
): string {
  const slug = ONBOARDING_DOCUMENTS[type].downloadSlug;
  const who = `${slugifyAscii(talent.prenom)}${slugifyAscii(talent.nom)}`;
  const tag = sanitizeTag(talent.externalId ?? talent.id.slice(0, 8));
  const year = schoolYear ? sanitizeYear(schoolYear) : '';
  return `${[slug, year, who, tag].filter(Boolean).join('-')}.pdf`;
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

/** `2025-2026` kept readable, so the hyphen inside the year survives. */
function sanitizeYear(s: string): string {
  return s.replace(/[^0-9-]/g, '');
}

/**
 * A talent's "finished" onboarding documents are EITHER:
 *   - the image-rights PDF, once the legal guardian has decided either way
 *     (authorization OR refusal both produce a legal PDF worth archiving), OR
 *   - a règlement intérieur PDF, one per school year, and ONLY once that year's
 *     is co-signed by BOTH the talent (`rulesSignedAt`) AND the parent
 *     (`parentRulesSignedAt`). Each year's règlement is a single artifact
 *     carrying both signature blocks, so the two-signature gate guards that one
 *     file: a talent-only-signed règlement never matches.
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

/**
 * A finished règlement is one DOSSIER, not one talent: a returning talent has a
 * complete document per school year they walked, and each is its own signed
 * artifact at its own key. Reading these three columns off the projection on
 * `Talent` would answer for the most recent dossier only, so the day a talent
 * reopens one their previous years' documents would vanish from the archive.
 */
const FINISHED_RULES_DOSSIER_WHERE: Prisma.Onboarding_RecordWhereInput = {
  rulesSignedAt: { not: null },
  parentRulesSignedAt: { not: null },
  rulesFilePath: { not: null },
};

const FINISHED_ONBOARDING_DOCS_WHERE: Prisma.TalentWhereInput = {
  OR: [
    FINISHED_IMAGE_RIGHTS_WHERE,
    { onboardingRecords: { some: FINISHED_RULES_DOSSIER_WHERE } },
  ],
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

/**
 * The Talent columns + dossier rows the "finished" projection reads. The
 * dossiers are pre-filtered in SQL, so every row that comes back is a finished
 * règlement and the projection below only has to date it.
 */
const FINISHED_FIELDS_SELECT = {
  imageRightsDecidedAt: true,
  imageRightsFilePath: true,
  onboardingRecords: {
    where: FINISHED_RULES_DOSSIER_WHERE,
    select: {
      schoolYear: true,
      rulesSignedAt: true,
      parentRulesSignedAt: true,
      rulesFilePath: true,
    },
    orderBy: { schoolYear: 'asc' },
  },
} satisfies Prisma.TalentSelect;

type TalentFinishedFields = Prisma.TalentGetPayload<{
  select: typeof FINISHED_FIELDS_SELECT;
}>;

/** One finished document with the instant it became legally complete. */
export interface FinishedOnboardingDocTime {
  type: ExportableDocumentType;
  /**
   * When the document became legally complete: the guardian's decision for
   * droit à l'image, and the LATER of the two required signatures (student +
   * guardian co-sign) for the règlement.
   */
  finishedAt: Date;
  /**
   * School year the document belongs to, for a `dossier`-scoped kind; null for
   * an `account`-scoped one. What tells a returning talent's two règlements
   * apart, in the archive and in their filename.
   */
  schoolYear: string | null;
}

/** A finished document with the storage key holding it. */
interface FinishedOnboardingDocKey extends FinishedOnboardingDocTime {
  key: string;
}

/**
 * Single source of truth for WHICH of a talent's onboarding docs are finished,
 * WHEN each completed and WHERE each is stored.
 * {@link FINISHED_ONBOARDING_DOCS_WHERE} is the coarse SQL prefilter that
 * fetches candidate rows; this is the exact per-document projection (it also
 * resolves the règlement's max-of-two-signatures instant, which the SQL gate
 * can't express). Keep the two in step.
 *
 * The key travels with the document rather than being looked up again by the
 * caller: with one règlement per year there is no longer a single column a
 * caller could re-derive it from, and the two non-null assertions that used to
 * do it are gone with it.
 */
function finishedOnboardingDocsOf(
  t: TalentFinishedFields,
): FinishedOnboardingDocKey[] {
  const out: FinishedOnboardingDocKey[] = [];
  if (t.imageRightsDecidedAt && t.imageRightsFilePath) {
    out.push({
      type: 'image-rights',
      finishedAt: t.imageRightsDecidedAt,
      schoolYear: null,
      key: t.imageRightsFilePath,
    });
  }
  for (const d of t.onboardingRecords) {
    // Non-null: `FINISHED_RULES_DOSSIER_WHERE` already required all three.
    if (!d.rulesSignedAt || !d.parentRulesSignedAt || !d.rulesFilePath)
      continue;
    out.push({
      type: 'rules',
      finishedAt:
        d.parentRulesSignedAt > d.rulesSignedAt
          ? d.parentRulesSignedAt
          : d.rulesSignedAt,
      schoolYear: d.schoolYear,
      key: d.rulesFilePath,
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
  // Storage keys are dropped here on purpose: this list is serialised to the
  // admin page, which only counts documents per period and per type.
  return talents
    .flatMap(finishedOnboardingDocsOf)
    .map(({ type, finishedAt, schoolYear }) => ({
      type,
      finishedAt,
      schoolYear,
    }));
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

export interface FinishedOnboardingDoc extends FinishedOnboardingDocKey {
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
      docs.push({
        ...doc,
        filename: onboardingDownloadFilename(doc.type, t, doc.schoolYear),
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

/** One row of the talent's own "Mes documents" list. */
export interface TalentDocumentEntry {
  type: TalentViewableDocumentType;
  label: string;
  /** Present for a per-year document, null for a once-per-account one. */
  schoolYear: string | null;
  signedAt: Date;
  /** Whether the rendered PDF has landed in storage. */
  ready: boolean;
  /** Guardian who decided an `image-rights` document, which they alone sign. */
  signerName: string | null;
  /**
   * Guardian who co-signed a `rules` document on top of the talent's own
   * signature (both signature events live on that year's single shared PDF).
   * Read from the dossier, so an older document shows the guardian who signed
   * THAT year rather than whoever signed most recently.
   */
  coSigner: { name: string; signedAt: Date } | null;
}

/** `Prenom Nom`, or whichever half exists, or null. */
function signerFullName(
  prenom: string | null,
  nom: string | null,
): string | null {
  if (prenom && nom) return `${prenom} ${nom}`;
  return nom ?? prenom;
}

/**
 * The documents a talent has actually signed, newest first, one entry per
 * artifact: their image-rights decision, plus one règlement per school year they
 * completed.
 *
 * A list rather than one entry per document *type*, which is what this used to
 * return: a per-year kind cannot be projected into a single row, and collapsing
 * it to the most recent dossier is what made a returning talent's previous
 * règlement disappear from their own settings page the moment they reopened a
 * dossier. Unsigned documents are absent rather than listed as unavailable; the
 * caller still decides what to do with a signed one whose render is missing.
 */
export async function listTalentDocuments(
  talentId: string,
): Promise<TalentDocumentEntry[]> {
  const talent = await prisma.talent.findUnique({
    where: { id: talentId },
    select: {
      imageRightsDecidedAt: true,
      imageRightsFilePath: true,
      imageRightsSignerPrenom: true,
      imageRightsSignerNom: true,
      onboardingRecords: {
        where: { rulesSignedAt: { not: null } },
        select: {
          schoolYear: true,
          rulesSignedAt: true,
          rulesFilePath: true,
          parentRulesSignedAt: true,
          parentRulesSignerPrenom: true,
          parentRulesSignerNom: true,
        },
      },
    },
  });
  if (!talent) return [];

  const entries: TalentDocumentEntry[] = [];
  if (talent.imageRightsDecidedAt) {
    entries.push({
      type: 'image-rights',
      label: ONBOARDING_DOCUMENTS['image-rights'].label,
      schoolYear: null,
      signedAt: talent.imageRightsDecidedAt,
      ready: talent.imageRightsFilePath !== null,
      signerName: signerFullName(
        talent.imageRightsSignerPrenom,
        talent.imageRightsSignerNom,
      ),
      coSigner: null,
    });
  }
  for (const d of talent.onboardingRecords) {
    if (!d.rulesSignedAt) continue;
    const coSignerName = signerFullName(
      d.parentRulesSignerPrenom,
      d.parentRulesSignerNom,
    );
    entries.push({
      type: 'rules',
      label: ONBOARDING_DOCUMENTS.rules.label,
      schoolYear: d.schoolYear,
      signedAt: d.rulesSignedAt,
      ready: d.rulesFilePath !== null,
      signerName: null,
      coSigner:
        d.parentRulesSignedAt && coSignerName
          ? { name: coSignerName, signedAt: d.parentRulesSignedAt }
          : null,
    });
  }
  return entries.sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime());
}

/**
 * Resolves the storage key of one document a talent may download, or null when
 * there is nothing to serve.
 *
 * The contract is to serve a *signed* document, so both the signature and the
 * rendered file are required. Gating on the file alone would keep handing back a
 * stale PDF after a signature is voided (an admin onboarding reset deletes the
 * dossier), serving a document the rest of the app already treats as unsigned.
 *
 * `schoolYear` selects which dossier for a per-year document; omitted, it
 * resolves to the talent's most recently signed one, so a plain link keeps
 * working. It is never used to reach another talent's row: the lookup is scoped
 * by `talentId` first.
 */
export async function resolveTalentDocumentKey(
  talentId: string,
  type: TalentViewableDocumentType,
  schoolYear?: string | null,
): Promise<{ key: string; schoolYear: string | null } | null> {
  if (ONBOARDING_DOCUMENTS[type].scope === 'account') {
    const talent = await prisma.talent.findUnique({
      where: { id: talentId },
      select: { imageRightsDecidedAt: true, imageRightsFilePath: true },
    });
    if (!talent?.imageRightsDecidedAt || !talent.imageRightsFilePath) {
      return null;
    }
    return { key: talent.imageRightsFilePath, schoolYear: null };
  }

  const dossier = await prisma.onboarding_Record.findFirst({
    where: {
      talentId,
      rulesSignedAt: { not: null },
      rulesFilePath: { not: null },
      ...(schoolYear ? { schoolYear } : {}),
    },
    orderBy: { rulesSignedAt: 'desc' },
    select: { schoolYear: true, rulesFilePath: true },
  });
  if (!dossier?.rulesFilePath) return null;
  return { key: dossier.rulesFilePath, schoolYear: dossier.schoolYear };
}
