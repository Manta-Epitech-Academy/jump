import { prisma } from '$lib/server/db';
import {
  enqueueOnboardingPdfJob,
  runOnboardingPdfJob,
} from './onboardingPdfJobService';

/**
 * Records the legal guardian's online co-signature of the règlement intérieur
 * and enqueues a regeneration of the shared rules PDF, atomically. Sibling of
 * {@link recordImageRightsDecision}: a règlement signature is a single act
 * (no accept/refuse — agreeing is the only outcome), so there is no decision
 * field, only the timestamp + signer details.
 *
 * The règlement PDF is a *shared* artifact carrying both the student's and the
 * guardian's signature blocks; the worker reads the current signature columns
 * from the talent row and renders whichever blocks exist. Clearing
 * `rulesFilePath` here drops the stale single-signer PDF while the worker
 * regenerates the dual-signed version. Fire-and-forget generation, mirroring
 * the rest of the onboarding PDF pipeline: the caller's response isn't blocked
 * on Puppeteer/S3.
 */
export async function recordParentRulesSignature(args: {
  talentId: string;
  studentName: string;
  signerPrenom: string;
  signerNom: string;
  relationship: string;
  city: string;
}): Promise<void> {
  const now = new Date();

  const job = await prisma.$transaction(async (tx) => {
    await tx.talent.update({
      where: { id: args.talentId },
      data: {
        parentRulesSignedAt: now,
        parentRulesSignerPrenom: args.signerPrenom,
        parentRulesSignerNom: args.signerNom,
        parentRulesRelationship: args.relationship,
        parentRulesSignedCity: args.city,
        // Drop the prior single-signer PDF: the worker will rewrite the same
        // S3 key with both signatures.
        rulesFilePath: null,
      },
    });
    return enqueueOnboardingPdfJob(tx, {
      talentId: args.talentId,
      documentType: 'rules',
      payload: {
        studentName: args.studentName,
        signedAt: now.toISOString(),
      },
    });
  });

  void runOnboardingPdfJob(job.id);
}
