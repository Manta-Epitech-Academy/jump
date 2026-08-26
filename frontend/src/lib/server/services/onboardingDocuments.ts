/**
 * Single source of truth for the onboarding documents a talent signs, and for
 * which record each one lives on. Consumed by the PDF generator (titles), the
 * PDF job service (where the generated S3 key lands), the talent-facing "Mes
 * documents" view, and the staff archive export.
 *
 * **Every generated document is per school year**, and lives on the matching
 * `Onboarding_Record`: signature, co-signature or decision, and the rendered PDF
 * together. A talent therefore has one règlement and one droit à l'image per
 * year they walked, which is why the reads here return lists rather than one row
 * per document kind. The charte is the only `account`-scoped kind left, and it
 * is a checkbox acceptance with no PDF at all, so nothing here has to resolve a
 * per-talent key any more.
 *
 * Keep that mapping here only: scattering it invites the consumers to drift, and
 * it has now drifted twice for the same reason. The règlement kept resolving to
 * a single per-talent artifact after it became annual; the droit à l'image would
 * have done exactly the same the day the decision became annual, because both
 * were described by one column name on `Talent`.
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
   * `account` — accepted at most once per talent, so the column lives on
   * `Talent`. Only the charte, and only because a talent who comes back is never
   * asked for it again: it is a once-per-account RGPD consent, not a yearly
   * contract.
   *
   * `dossier` — settled once per school year, so both the act and the render
   * live on the matching `Onboarding_Record`: the règlement intérieur, and the
   * droit-à-l'image decision since it became annual too.
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
   * Dossier column holding the S3 key of the generated PDF. Absent for the only
   * `account`-scoped kind, the charte, which is a checkbox acceptance with no
   * generated document at all.
   *
   * It replaced a `filePathField` naming a column on `Talent`, and the change of
   * record is the point: a single per-talent key is what let a second year's
   * render overwrite a co-signed first year, twice, once per document kind.
   * Every generated document is now per-year, so there is no per-talent key left
   * to name.
   */
  dossierFilePathField?: 'rulesFilePath' | 'imageRightsFilePath';
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
    dossierFilePathField: 'rulesFilePath',
    downloadSlug: 'rules',
  },
  // Neutral label: the same document type backs both an authorization and a
  // refusal. The PDF generator picks the decision-specific title and body.
  //
  // Per-year like the règlement since the decision became annual: the guardian
  // is asked again each school year, so each year has its own signed artifact
  // and a new decision adds a document instead of destroying the previous one.
  'image-rights': {
    label: "Droit à l'Image",
    scope: 'dossier',
    dossierFilePathField: 'imageRightsFilePath',
    downloadSlug: 'imagerights',
  },
};

/**
 * Build a human, unique download filename for a generated onboarding PDF:
 *   {slug}-{year}-{prenomnom}-{tag}.pdf
 *     slug      charter | rules | imagerights
 *     year      school year of the dossier the document belongs to
 *     prenomnom lowercased, accent-stripped, alphanumerics only (concatenated)
 *     tag       Talent.externalId (Salesforce id) when set, else the first 8
 *               chars of the talent id, so homonyms' filenames stay distinct.
 * Pure ASCII, so it needs no RFC 5987 Content-Disposition encoding. Any segment
 * that resolves to empty is dropped (a name that slugifies away), leaving a
 * clean join rather than a stray double hyphen.
 *
 * The year is what keeps a returning talent's documents of the same kind apart:
 * without it both land in a bulk export under one name, and a zip entry silently
 * replaces the other. It is required rather than optional now that both
 * generated kinds are per-year; a caller with no year to pass is asking for a
 * document that does not exist.
 */
export function onboardingDownloadFilename(
  type: OnboardingDocumentType,
  talent: Pick<Talent, 'prenom' | 'nom' | 'externalId' | 'id'>,
  schoolYear: string,
): string {
  const slug = ONBOARDING_DOCUMENTS[type].downloadSlug;
  const who = `${slugifyAscii(talent.prenom)}${slugifyAscii(talent.nom)}`;
  const tag = sanitizeTag(talent.externalId ?? talent.id.slice(0, 8));
  const year = sanitizeYear(schoolYear);
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
 *   - a droit-à-l'image PDF, one per school year, once that year's legal
 *     guardian has decided either way (authorization OR refusal both produce a
 *     legal PDF worth archiving), OR
 *   - a règlement intérieur PDF, one per school year, and ONLY once that year's
 *     is co-signed by BOTH the talent (`rulesSignedAt`) AND the parent
 *     (`parentRulesSignedAt`). Each year's règlement is a single artifact
 *     carrying both signature blocks, so the two-signature gate guards that one
 *     file: a talent-only-signed règlement never matches.
 * Each arm also requires the generated PDF to exist on the row (`*FilePath`).
 * Shared by the bulk-export endpoint and the page that gates its button so the
 * filter can never drift between the two.
 *
 * **Both arms are one DOSSIER, not one talent**: a returning talent has a
 * document of each kind per school year they walked, and each is its own signed
 * artifact at its own key. Reading these columns off the projection on `Talent`
 * would answer for the most recent dossier only, so the day a talent reopens one
 * their previous years' documents would vanish from the archive.
 */
// The two arms of "finished", kept as named building blocks for the combined
// `OR` below (the coarse SQL prefilter for "has any finished doc"). The precise
// per-document projection lives in `finishedOnboardingDocsOf`; these only fetch
// candidate rows.
const FINISHED_IMAGE_RIGHTS_DOSSIER_WHERE: Prisma.Onboarding_RecordWhereInput =
  {
    imageRightsDecidedAt: { not: null },
    imageRightsFilePath: { not: null },
  };

const FINISHED_RULES_DOSSIER_WHERE: Prisma.Onboarding_RecordWhereInput = {
  rulesSignedAt: { not: null },
  parentRulesSignedAt: { not: null },
  rulesFilePath: { not: null },
};

/** A dossier carrying at least one finished document, either kind. */
const FINISHED_DOSSIER_WHERE: Prisma.Onboarding_RecordWhereInput = {
  OR: [FINISHED_RULES_DOSSIER_WHERE, FINISHED_IMAGE_RIGHTS_DOSSIER_WHERE],
};

const FINISHED_ONBOARDING_DOCS_WHERE: Prisma.TalentWhereInput = {
  onboardingRecords: { some: FINISHED_DOSSIER_WHERE },
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
 * The dossier rows the "finished" projection reads. They are pre-filtered in
 * SQL to those carrying at least one finished document, so the projection below
 * only has to say which kinds a given row carries and date each.
 */
const FINISHED_FIELDS_SELECT = {
  onboardingRecords: {
    where: FINISHED_DOSSIER_WHERE,
    select: {
      schoolYear: true,
      rulesSignedAt: true,
      parentRulesSignedAt: true,
      rulesFilePath: true,
      imageRightsDecidedAt: true,
      imageRightsFilePath: true,
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
   * School year the document belongs to. Never null: both generated kinds are
   * per-year, and this is what tells a returning talent's two documents of one
   * kind apart, in the archive and in their filename.
   */
  schoolYear: string;
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
  for (const d of t.onboardingRecords) {
    // A dossier matched the prefilter on either arm, so each kind is tested on
    // its own columns rather than assumed: a year can carry a finished règlement
    // and no decision yet, or the reverse.
    if (d.rulesSignedAt && d.parentRulesSignedAt && d.rulesFilePath) {
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
    if (d.imageRightsDecidedAt && d.imageRightsFilePath) {
      out.push({
        type: 'image-rights',
        finishedAt: d.imageRightsDecidedAt,
        schoolYear: d.schoolYear,
        key: d.imageRightsFilePath,
      });
    }
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
  /** The school year the document belongs to. Both viewable kinds are per-year. */
  schoolYear: string;
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
 * artifact: per school year they walked, the règlement they signed and the
 * droit-à-l'image decision their guardian took.
 *
 * A list rather than one entry per document *type*, which is what this used to
 * return: a per-year kind cannot be projected into a single row, and collapsing
 * it to the most recent dossier is what made a returning talent's previous
 * règlement disappear from their own settings page the moment they reopened a
 * dossier. Unsigned documents are absent rather than listed as unavailable; the
 * caller still decides what to do with a signed one whose render is missing.
 *
 * Read off the dossier rows rather than the talent, for both kinds. The flat
 * columns describe the most recent dossier only, so serving this page from them
 * would hide every document of a year the talent has moved past, which is the
 * whole reason each of these became annual.
 */
export async function listTalentDocuments(
  talentId: string,
): Promise<TalentDocumentEntry[]> {
  const dossiers = await prisma.onboarding_Record.findMany({
    where: {
      talentId,
      OR: [
        { rulesSignedAt: { not: null } },
        { imageRightsDecidedAt: { not: null } },
      ],
    },
    select: {
      schoolYear: true,
      rulesSignedAt: true,
      rulesFilePath: true,
      parentRulesSignedAt: true,
      parentRulesSignerPrenom: true,
      parentRulesSignerNom: true,
      imageRightsDecidedAt: true,
      imageRightsFilePath: true,
      imageRightsSignerPrenom: true,
      imageRightsSignerNom: true,
    },
  });

  const entries: TalentDocumentEntry[] = [];
  for (const d of dossiers) {
    if (d.rulesSignedAt) {
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
    if (d.imageRightsDecidedAt) {
      entries.push({
        type: 'image-rights',
        label: ONBOARDING_DOCUMENTS['image-rights'].label,
        schoolYear: d.schoolYear,
        signedAt: d.imageRightsDecidedAt,
        ready: d.imageRightsFilePath !== null,
        // Read from the dossier, so an older document names the guardian who
        // decided THAT year rather than whoever decided most recently.
        signerName: signerFullName(
          d.imageRightsSignerPrenom,
          d.imageRightsSignerNom,
        ),
        coSigner: null,
      });
    }
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
 * `schoolYear` selects which dossier; omitted, it resolves to the talent's most
 * recently signed one, so a plain link keeps working. It is never used to reach
 * another talent's row: the lookup is scoped by `talentId` first.
 *
 * One lookup for both kinds, parameterised by which columns the kind lives in.
 * The `account` branch this used to open for the droit à l'image is gone with
 * the per-talent key it read.
 */
export async function resolveTalentDocumentKey(
  talentId: string,
  type: TalentViewableDocumentType,
  schoolYear?: string | null,
): Promise<{ key: string; schoolYear: string } | null> {
  const isRules = type === 'rules';
  const signedAtField = isRules ? 'rulesSignedAt' : 'imageRightsDecidedAt';
  const filePathField = ONBOARDING_DOCUMENTS[type].dossierFilePathField;
  if (!filePathField) return null;

  const dossier = await prisma.onboarding_Record.findFirst({
    where: {
      talentId,
      [signedAtField]: { not: null },
      [filePathField]: { not: null },
      ...(schoolYear ? { schoolYear } : {}),
    },
    orderBy: { [signedAtField]: 'desc' },
    select: {
      schoolYear: true,
      rulesFilePath: true,
      imageRightsFilePath: true,
    },
  });
  const key = dossier?.[filePathField];
  if (!key) return null;
  return { key, schoolYear: dossier.schoolYear };
}
