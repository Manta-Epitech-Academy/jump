import type { ImageRightsDecision } from '$lib/domain/imageRights';
import type { ImageRightsDecisionSource } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  enqueueOnboardingPdfJob,
  runOnboardingPdfJob,
} from './onboardingPdfJobService';

/**
 * Records a legal guardian's image-rights decision (authorize *or* refuse) and
 * enqueues the matching PDF, atomically. The single entry point for the parent
 * signing flow, a later change of mind from the child dashboard, AND a staff
 * correction recorded on the guardian's behalf — keeping the write in one place
 * stops the talent decision and the generated document from drifting apart.
 *
 * Each call appends one {@link ImageRightsDecisionRecord} fact (append-only, the
 * prior decision is never overwritten — a minor's consent is revocable "à tout
 * moment", so its history is worth keeping) and refreshes the cached projection
 * on the talent row to that newest fact. Facts-as-rows, state-as-projection, the
 * same shape as the XP ledger; every read site keeps reading the projection.
 *
 * The PDF is deliberately NOT kept per-decision. It is a current-state rendering
 * on a stable S3 key (`documents/{talentId}/image-rights.pdf`), regenerated and
 * overwritten on each change — exactly how the règlement and charte PDFs behave
 * (the bucket holds the current artifact, not an event log). The authoritative
 * record is the ledger row, and the generator is a pure function of that row's
 * fields, so any past decision's document is reproducible from its record if it
 * is ever needed; storing one object per decision would only fork image-rights
 * away from the rest of the onboarding PDF pipeline for no gain. Re-deciding
 * clears `imageRightsFilePath` so the now-stale document is never served while
 * the worker overwrites that key. Fire-and-forget generation, mirroring the rest
 * of the pipeline: the caller's response isn't blocked on Puppeteer/S3.
 */
export async function recordImageRightsDecision(args: {
  talentId: string;
  studentName: string;
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
    // Append the fact. Never an update — re-deciding is a new row, not a clobber.
    await tx.imageRightsDecisionRecord.create({
      data: {
        talentId: args.talentId,
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
    // Refresh the cached projection to the just-appended (newest) fact.
    await tx.talent.update({
      where: { id: args.talentId },
      data: {
        imageRightsDecision: args.decision,
        imageRightsDecidedAt: now,
        imageRightsSignerPrenom: args.signerPrenom,
        imageRightsSignerNom: args.signerNom,
        // Drop the prior PDF: a switched decision makes it legally wrong. The
        // worker overwrites the stable key with the new rendering once it runs.
        imageRightsFilePath: null,
      },
    });
    return enqueueOnboardingPdfJob(tx, {
      talentId: args.talentId,
      documentType: 'image-rights',
      payload: {
        studentName: args.studentName,
        signerName,
        relationship: args.relationship,
        city: args.city,
        decision: args.decision,
        signedAt: now.toISOString(),
      },
    });
  });

  void runOnboardingPdfJob(job.id);
}
