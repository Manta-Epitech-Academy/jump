import { prisma } from '$lib/server/db';
import type { ReglementVersion } from '$lib/content/reglement';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';
import { upsertOnboardingYearRecord } from './onboardingYearService';
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
 *
 * The co-signature is filed on the dossier the projection currently describes
 * (`Talent.onboardingSchoolYear`) - the same one the parent page rendered the
 * text of, and the only one it ever offers to sign. A talent with no dossier at
 * all cannot appear on that page; the fallback to the year in progress is there
 * so an unexpected call opens the right row rather than none.
 *
 * `reglementVersion` is the version the guardian was actually shown, and it is
 * written only when the dossier carries none yet. The guardian is invited at the
 * parents step, four rungs before their child reaches the règlement, so a
 * guardian-first co-signature is reachable and would otherwise leave the
 * version unpinned: the PDF would then render the pre-versioning text under a
 * signature given on the current one. Whoever signs first pins it; the second
 * signer joins that same text, never overwrites it.
 */
export async function recordParentRulesSignature(args: {
  talentId: string;
  studentName: string;
  signerPrenom: string;
  signerNom: string;
  relationship: string;
  city: string;
  reglementVersion: ReglementVersion;
}): Promise<void> {
  const now = new Date();

  const job = await prisma.$transaction(async (tx) => {
    const talent = await tx.talent.findUniqueOrThrow({
      where: { id: args.talentId },
      select: { onboardingSchoolYear: true },
    });
    const schoolYear = talent.onboardingSchoolYear ?? currentSchoolYearLabel();

    // An already-pinned version is the text the talent signed, and it wins:
    // whoever signs first pins it, the second signer joins that same text. Read
    // inside the transaction rather than expressed as a guarded update, because
    // the dossier row may not exist yet and the upsert below has to carry the
    // version into its create branch.
    const dossier = await tx.onboarding_Record.findUnique({
      where: { talentId_schoolYear: { talentId: args.talentId, schoolYear } },
      select: { reglementVersion: true },
    });

    await upsertOnboardingYearRecord(tx, {
      talentId: args.talentId,
      schoolYear,
      patch: {
        parentRulesSignedAt: now,
        parentRulesSignerPrenom: args.signerPrenom,
        parentRulesSignerNom: args.signerNom,
        parentRulesRelationship: args.relationship,
        parentRulesSignedCity: args.city,
        ...(dossier?.reglementVersion == null
          ? { reglementVersion: args.reglementVersion }
          : {}),
      },
    });

    await tx.talent.update({
      where: { id: args.talentId },
      data: {
        // Drop the prior single-signer PDF: the worker will rewrite the same
        // S3 key with both signatures. A render, not a dossier fact, so it
        // stays flat on the talent row.
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
