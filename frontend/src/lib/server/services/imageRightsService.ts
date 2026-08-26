import type {
  ImageRightsDecision,
  ImageRightsDecisionSummary,
} from '$lib/domain/imageRights';
import type { ImageRightsDecisionSource, Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { CURRENT_DROIT_IMAGE_VERSION } from '$lib/content/droit-image';
import {
  guardianActSchoolYear,
  upsertOnboardingYearRecord,
} from './onboardingYearService';
import {
  enqueueOnboardingPdfJob,
  runOnboardingPdfJob,
} from './onboardingPdfJobService';

/**
 * Newest decision first, for any read of the image-rights ledger.
 *
 * Shared as a fragment rather than retyped per query, the same way
 * `db/dossierCompliance` shares its `where`s: a surface that ordered on
 * `createdAt` alone would rank the moment a staff correction was keyed above the
 * moment the guardian actually decided, and it would disagree with the badge
 * sheet without either side being obviously wrong. See
 * {@link latestImageRightsDecisions} for why that ordering is the rule.
 */
export const LATEST_IMAGE_RIGHTS_DECISION_ORDER: Prisma.ImageRightsDecisionRecordOrderByWithRelationInput[] =
  [{ decidedAt: 'desc' }, { createdAt: 'desc' }];

/**
 * Records a legal guardian's image-rights decision (authorize *or* refuse) and
 * enqueues the matching PDF, atomically. The single entry point for the parent
 * signing flow, a later change of mind from the child dashboard, AND a staff
 * correction recorded on the guardian's behalf — keeping the write in one place
 * stops the talent decision and the generated document from drifting apart.
 *
 * Three layers, and each answers a question the others cannot:
 *
 *  1. **The fact.** Each call appends one `ImageRightsDecisionRecord` row
 *     (append-only, the prior decision is never overwritten — a minor's consent
 *     is revocable "à tout moment", so its history is worth keeping). The row
 *     carries the school year it answers for and the wording it committed to.
 *  2. **The year's current decision**, on that year's `Onboarding_Record`,
 *     alongside the guardian's other act (the règlement co-signature). Written
 *     through `upsertOnboardingYearRecord`, which is also what refreshes
 *  3. **the projection** on `Talent.imageRights*`, and only when this dossier is
 *     the talent's most recent one. That last clause is why the direct
 *     `talent.update` this service used to do is gone: a correction filed
 *     against an older dossier must not drag the projection back onto it.
 *
 * The decision belongs to the dossier the talent actually has, never to the year
 * on the clock ({@link guardianActSchoolYear}), so it lands on the same row as
 * the règlement co-signature the same guardian gives in the same session.
 *
 * The PDF is one artifact per school year, on a key carrying that year
 * (`documents/{talentId}/image-rights-{schoolYear}.pdf`). Within a year it is a
 * current-state rendering, regenerated and overwritten on each change, which is
 * how the règlement PDF behaves too: the bucket holds the current artifact of
 * each year, not an event log. A superseded decision stays reproducible from its
 * ledger row, which is only true because that row now carries its own `version`;
 * without it a regeneration would render today's wording under a decision taken
 * on another. Re-deciding clears that year's `imageRightsFilePath` so the stale
 * document is never served while the worker overwrites the key. Fire-and-forget
 * generation, mirroring the rest of the pipeline: the caller's response isn't
 * blocked on Puppeteer/S3.
 */
export async function recordImageRightsDecision(args: {
  talentId: string;
  decision: ImageRightsDecision;
  signerPrenom: string;
  signerNom: string;
  relationship: string;
  city: string;
  /** Defaults to `parent_portal`; pass `staff_correction` for the staff path. */
  source?: ImageRightsDecisionSource;
  /** The staff member recording a correction (kept only for `staff_correction`). */
  recordedByStaffId?: string | null;
  /** Staff reason for the correction (kept only for `staff_correction`). */
  note?: string | null;
}): Promise<void> {
  const now = new Date();
  const signerName = `${args.signerPrenom} ${args.signerNom}`;
  const source = args.source ?? 'parent_portal';
  const isStaff = source === 'staff_correction';

  const job = await prisma.$transaction(async (tx) => {
    const schoolYear = await guardianActSchoolYear(tx, args.talentId);

    // Append the fact. Never an update — re-deciding is a new row, not a clobber.
    // A single signer means the act always commits to the wording in force now,
    // unlike the règlement, where a guardian joins the version their child
    // already pinned. That holds for a staff correction too: it records a choice
    // the guardian is making today, not a re-filing of the old one.
    await tx.imageRightsDecisionRecord.create({
      data: {
        talentId: args.talentId,
        schoolYear,
        version: CURRENT_DROIT_IMAGE_VERSION,
        decision: args.decision,
        decidedAt: now,
        signerPrenom: args.signerPrenom,
        signerNom: args.signerNom,
        relationship: args.relationship,
        city: args.city,
        source,
        // Staff attribution is meaningful only for a correction; a parent acting
        // through the portal owns the row implicitly.
        recordedByStaffId: isStaff ? (args.recordedByStaffId ?? null) : null,
        note: isStaff ? (args.note ?? null) : null,
      },
    });

    // The year's current decision, which also refreshes the projection when this
    // dossier is the most recent one.
    await upsertOnboardingYearRecord(tx, {
      talentId: args.talentId,
      schoolYear,
      patch: {
        imageRightsDecision: args.decision,
        imageRightsDecidedAt: now,
        imageRightsSignerPrenom: args.signerPrenom,
        imageRightsSignerNom: args.signerNom,
        imageRightsRelationship: args.relationship,
        imageRightsSignedCity: args.city,
        imageRightsVersion: CURRENT_DROIT_IMAGE_VERSION,
        // Drop this year's prior PDF: a switched decision makes it legally
        // wrong. Nulled on the dossier, so the document of a PREVIOUS year keeps
        // its own render - it is a different artifact at a different key, and
        // this decision says nothing about it.
        imageRightsFilePath: null,
      },
    });

    return enqueueOnboardingPdfJob(tx, {
      talentId: args.talentId,
      documentType: 'image-rights',
      // The dossier decided just above, never "the current one": a guardian
      // deciding after the cutover legitimately writes to last year's dossier,
      // and a job can be retried days later when that has moved on.
      schoolYear,
    });
  });

  void runOnboardingPdfJob(job.id);
}

/**
 * The last decision each of these guardians ever made, whatever school year it
 * belongs to, keyed by talent. A talent with no decision is absent from the map.
 *
 * The one place the ledger's "newest first" rule lives, because it is not the
 * obvious one: rows are ordered on the decision INSTANT, with the row's creation
 * only as a tie-break. A staff correction consigning an offline decision carries
 * the date the guardian decided, so ordering on `createdAt` alone would let the
 * moment somebody typed it into Jump outrank the moment it was taken. Every
 * reader of "the latest decision" imports {@link LATEST_IMAGE_RIGHTS_DECISION_ORDER}
 * or calls this, so two surfaces cannot answer with different rows.
 *
 * Reads the ledger and not `Talent`: the projection is a per-dossier answer, so
 * it goes blank when a talent reopens one, and a refusal read from there would
 * lapse into "nobody asked yet" at the cutover. Whether a photo may be published
 * is not a question about a school year.
 *
 * Batched over ids rather than offered per talent, because every caller has a
 * set: a cohort's badge sheet, a guardian's children, a scoped compliance count.
 */
export async function latestImageRightsDecisions(
  talentIds: string[],
): Promise<Map<string, ImageRightsDecisionSummary>> {
  if (talentIds.length === 0) return new Map();
  const rows = await prisma.imageRightsDecisionRecord.findMany({
    where: { talentId: { in: talentIds } },
    orderBy: LATEST_IMAGE_RIGHTS_DECISION_ORDER,
    select: { talentId: true, decision: true, schoolYear: true },
  });
  const latest = new Map<string, ImageRightsDecisionSummary>();
  // Ordered newest first, so the first row seen for a talent is theirs to keep.
  for (const row of rows) {
    if (latest.has(row.talentId)) continue;
    latest.set(row.talentId, {
      decision: row.decision,
      schoolYear: row.schoolYear,
    });
  }
  return latest;
}
