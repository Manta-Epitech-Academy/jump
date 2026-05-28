import type { ImageRightsDecision } from '$lib/domain/imageRights';
import { prisma } from '$lib/server/db';
import {
  enqueueOnboardingPdfJob,
  runOnboardingPdfJob,
} from './onboardingPdfJobService';

/**
 * Records a legal guardian's image-rights decision (authorize *or* refuse) and
 * enqueues the matching PDF, atomically. The single entry point for both the
 * parent signing flow and a later change of mind from the child dashboard —
 * keeping the write in one place stops the talent decision and the generated
 * document from drifting apart.
 *
 * Re-deciding clears `imageRightsFilePath` so the now-stale document is never
 * served while the worker regenerates the correct one (keyed by the new
 * timestamp). Fire-and-forget generation, mirroring the rest of the onboarding
 * PDF pipeline: the caller's response isn't blocked on Puppeteer/S3.
 */
export async function recordImageRightsDecision(args: {
  talentId: string;
  studentName: string;
  decision: ImageRightsDecision;
  signerPrenom: string;
  signerNom: string;
  relationship: string;
  city: string;
}): Promise<void> {
  const now = new Date();
  const signerName = `${args.signerPrenom} ${args.signerNom}`;

  const job = await prisma.$transaction(async (tx) => {
    await tx.talent.update({
      where: { id: args.talentId },
      data: {
        imageRightsDecision: args.decision,
        imageRightsDecidedAt: now,
        imageRightsSignerPrenom: args.signerPrenom,
        imageRightsSignerNom: args.signerNom,
        // Drop the prior PDF: a switched decision makes it legally wrong. The
        // worker writes the fresh key (timestamped `now`) when it completes.
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
