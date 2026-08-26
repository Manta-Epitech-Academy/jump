import { prisma } from '$lib/server/db';
import type { ReglementVersion } from '$lib/content/reglement';
import {
  guardianActSchoolYear,
  upsertOnboardingYearRecord,
} from './onboardingYearService';
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
 * guardian's signature blocks; the worker reads the signature columns from the
 * dossier being signed and renders whichever blocks exist. Clearing that
 * dossier's `rulesFilePath` drops the stale single-signer PDF while the worker
 * regenerates the dual-signed version. Fire-and-forget generation, mirroring
 * the rest of the onboarding PDF pipeline: the caller's response isn't blocked
 * on Puppeteer/S3.
 *
 * The co-signature is filed on the dossier the projection currently describes,
 * through the shared {@link guardianActSchoolYear}: the same one the parent page
 * rendered the text of, and the same one the guardian's image-rights decision
 * lands on in the same session.
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
    const schoolYear = await guardianActSchoolYear(tx, args.talentId);

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
        // Drop this year's prior single-signer PDF: the worker rewrites the same
        // key with both signature blocks. Nulled on the dossier, so the document
        // of a PREVIOUS year keeps its own render - it is a different artifact at
        // a different key, and this co-signature says nothing about it.
        rulesFilePath: null,
        ...(dossier?.reglementVersion == null
          ? { reglementVersion: args.reglementVersion }
          : {}),
      },
    });

    return enqueueOnboardingPdfJob(tx, {
      talentId: args.talentId,
      documentType: 'rules',
      // The dossier co-signed just above, never "the current one": a guardian
      // signing after the cutover legitimately writes to last year's dossier.
      schoolYear,
      payload: {
        studentName: args.studentName,
        signedAt: now.toISOString(),
      },
    });
  });

  void runOnboardingPdfJob(job.id);
}
