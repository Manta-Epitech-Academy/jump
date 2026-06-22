import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { getStorage } from '$lib/server/infra/storage';
import { findUnreferencedParentAccount } from '$lib/server/services/parentAccount';
import { DATA_RETENTION_MONTHS } from '$lib/domain/retention';
import {
  clearOnboardingTimestamps,
  clearTalentOnboardingArtifacts,
} from '$lib/domain/talentOnboarding';

/**
 * The single GDPR-erasure primitive. Clears a talent's PII in place rather than
 * deleting rows: name/contact fields are nulled or replaced with placeholders,
 * the linked auth identity is scrubbed and its sessions/accounts dropped, and
 * every talent-scoped satellite that embeds a name, a contact detail, or free
 * text (interviews, portfolio, comm + send history, the PDF-job payload) is
 * deleted outright. The generated onboarding PDFs (charte / règlement student /
 * règlement parent / droit à l'image — each embeds the student's and guardian's
 * names and a signature) are deleted from object storage, not merely
 * dereferenced. We deliberately keep the de-identified behavioural telemetry
 * (participation, progress, minigame / quiz attempts, the xp ledger) so `xp`,
 * `eventsCount` and aggregate stats survive the erasure.
 *
 * Parents are data subjects too: their identity lives both as columns on the
 * Talent (both guardian slots, plus the guardian's typed signer name on the
 * image-rights decision and on the règlement co-signature) and as a
 * `bauth_user` (role `parent`) minted at onboarding so they can sign image
 * rights and co-sign the règlement. Both are erased here. The parent account
 * is shared across siblings (it is keyed by email and reused), so its
 * `bauth_user` is only scrubbed once no *other* talent still references that
 * email — otherwise a sibling's parent would lose their login.
 *
 * This is the *real* deletion mechanism behind both entry points:
 *   - the daily inactivity sweep (`anonymizeInactiveStudents`), and
 *   - a talent's own deletion request once staff fulfil it
 *     (`talentDeletionService.fulfillTalentDeletion`).
 *
 * Idempotent: re-running on an already-anonymised talent is a harmless no-op
 * write (its parent emails are already null, so nothing is re-resolved). Takes
 * a transaction client so callers can bundle it with their own bookkeeping
 * (e.g. flipping a deletion request to `fulfilled`) atomically.
 *
 * Returns the S3 keys of the onboarding PDFs it dereferenced. The objects must
 * be deleted from storage to complete the erasure, but that's an external call
 * — it cannot run inside the transaction (it would risk the interactive-tx
 * timeout rolling back the legally-required scrub). Callers hand the keys to
 * {@link deleteAnonymizedDocuments} *after* the transaction commits.
 */
export async function anonymizeTalent(
  tx: Prisma.TransactionClient,
  talentId: string,
): Promise<string[]> {
  const talent = await tx.talent.findUnique({
    where: { id: talentId },
    select: {
      userId: true,
      email: true,
      parentEmail: true,
      parent2Email: true,
      charterFilePath: true,
      rulesFilePath: true,
      imageRightsFilePath: true,
    },
  });
  if (!talent) return [];

  // Captured before the update below nulls them, so we can scrub the matching
  // parent accounts afterwards (step 4).
  const parentEmails = [talent.parentEmail, talent.parent2Email].filter(
    (e): e is string => !!e,
  );

  // S3 keys of the generated onboarding PDFs, captured before the update nulls
  // the columns. Returned to the caller, which deletes the objects post-commit.
  const documentKeys = [
    talent.charterFilePath,
    talent.rulesFilePath,
    talent.imageRightsFilePath,
  ].filter((k): k is string => !!k);

  // 1. Clear all PII fields on the Talent (keep xp / eventsCount), including
  //    both parent/guardian slots and every onboarding-state timestamp (those
  //    are behavioural metadata about a real person's progression — the
  //    anonymised row must not carry a timeline).
  await tx.talent.update({
    where: { id: talentId },
    data: {
      ...clearOnboardingTimestamps(),
      nom: 'Anonymisé',
      prenom: 'Anonymisé',
      email: null,
      externalId: null,
      phone: null,
      civilite: null,
      highSchoolNameManual: null,
      schoolId: null,
      interestsFreeText: null,
      setupDescription: null,
      discordId: null,
      // Image-rights decision: the guardian's typed signer name is their PII,
      // and decision/decidedAt move with it (the trio is one signed fact — see
      // domain/imageRights). Sever the PDF references too; the objects are
      // deleted post-commit by the caller (keys returned below).
      imageRightsDecision: null,
      imageRightsDecidedAt: null,
      imageRightsSignerPrenom: null,
      imageRightsSignerNom: null,
      // Règlement guardian co-signature: same shape as image-rights — the
      // guardian's typed name + relationship + city are PII, the timestamp moves
      // with them, and the shared règlement PDF (deleted post-commit via the
      // keys returned below) embeds both names + signatures. See
      // `parentRulesService.recordParentRulesSignature`.
      parentRulesSignedAt: null,
      parentRulesSignerPrenom: null,
      parentRulesSignerNom: null,
      parentRulesRelationship: null,
      parentRulesSignedCity: null,
      // Talent-owned onboarding signature artifacts (charte / règlement PDF
      // keys + the talent's place-of-signature). Shared with the admin reset via
      // the canonical list so a new artifact scrubs on both paths; the PDF keys
      // were captured above for post-commit S3 deletion.
      ...clearTalentOnboardingArtifacts(),
      // Image-rights PDF key — parent-decided, so not part of the talent ladder;
      // captured above for deletion alongside the others.
      imageRightsFilePath: null,
      // Guardian 1
      parentType: null,
      parentCivilite: null,
      parentNom: null,
      parentPrenom: null,
      parentEmail: null,
      parentPhone: null,
      // Guardian 2
      parent2Type: null,
      parent2Civilite: null,
      parent2Nom: null,
      parent2Prenom: null,
      parent2Email: null,
      parent2Phone: null,
      niveau: null,
      badges: Prisma.DbNull,
      lastSyncedAt: null,
    },
  });

  // 2. Delete every talent-scoped satellite row that carries identifying
  //    content. Counterpart to the in-place scrub above: where a record embeds
  //    a name, a contact detail, or free text, the whole row is removed rather
  //    than nulled field-by-field (drift-proof as columns are added, and the
  //    same set resetTalentToImport wipes). The anonymous behavioural telemetry
  //    is deliberately KEPT (participation, stepsProgress, minigameAttempt,
  //    talentQuizAttempt, xpGrant, observable / competence state): once the name
  //    is gone those are de-identified activity backing xp / eventsCount and
  //    aggregate stats.
  //      - talentSfImport / talentInterest / imageRightsDecisionRecord: the SF
  //        mirror, interest selections, and the image-rights ledger (the ledger
  //        embeds the guardian's typed signer name).
  //      - note_TalentNote: staff notes about the minor (pedago + administratif
  //        free text). The whole feed is removed on erasure.
  //      - interview / interviewReset: the synthesis row holds free-text staff
  //        observations about the minor; both existing wipe paths already
  //        hard-delete it. InterviewReset is a reset's audit trace + reason.
  //      - portfolioItem: student-authored content with potential PII.
  //      - onboardingPdfJob: payload snapshots the student + guardian name and
  //        city. The generated S3 PDFs are deleted post-commit; this is the DB
  //        copy of the same names.
  //      - onboardingReminder: captured subject / body of relance mail + SMS.
  //      - broadcastRecipient: the talent's and the parent's email / phone per
  //        send, matched on both slots (SetNull relations, so deleted here, not
  //        left orphaned). The parent is a data subject too.
  await tx.talentSfImport.deleteMany({ where: { talentId } });
  await tx.talentInterest.deleteMany({ where: { talentId } });
  await tx.imageRightsDecisionRecord.deleteMany({ where: { talentId } });
  await tx.note_TalentNote.deleteMany({ where: { talentId } });
  // feedback_Submission: the talent's bilan answers embed free-text opinions
  // (textarea questions) — identifying content, so the whole submission is
  // removed (cascades to its answers + selected options). A public bilan response
  // carries no talentId until reconciled, yet stores the respondent's self-typed
  // e-mail / phone / name, so it is also matched by the talent's own e-mail and
  // erased the same way (case-insensitive: the public form takes free input).
  await tx.feedback_Submission.deleteMany({
    where: {
      OR: [
        { talentId },
        ...(talent.email
          ? [
              {
                talentId: null,
                respondentEmail: {
                  equals: talent.email,
                  mode: 'insensitive' as const,
                },
              },
            ]
          : []),
      ],
    },
  });
  await tx.interview.deleteMany({ where: { talentId } });
  await tx.interviewReset.deleteMany({ where: { talentId } });
  await tx.portfolioItem.deleteMany({ where: { talentId } });
  await tx.onboardingPdfJob.deleteMany({ where: { talentId } });
  await tx.onboardingReminder.deleteMany({ where: { talentId } });
  await tx.broadcastRecipient.deleteMany({
    where: { OR: [{ talentId }, { parentOfTalentId: talentId }] },
  });

  // 3. Scrub the linked BetterAuth user and revoke its access — only if linked.
  if (talent.userId) {
    await tx.bauth_user.update({
      where: { id: talent.userId },
      data: {
        name: 'Utilisateur Anonymisé',
        image: null,
        email: `anonymized-${talentId}@jump.internal`,
      },
    });

    await tx.bauth_session.deleteMany({ where: { userId: talent.userId } });
    await tx.bauth_account.deleteMany({ where: { userId: talent.userId } });
  }

  // 4. Scrub the parent `bauth_user`(s) — but only those no other talent still
  //    references, so a shared parent (siblings) keeps their account. Already-
  //    anonymised siblings have null parent emails, so they never count here.
  //    The sibling + role guard is shared with resetTalentToImport; here we
  //    scrub to a placeholder rather than delete (RGPD erasure keeps the row).
  for (const email of new Set(parentEmails)) {
    const orphan = await findUnreferencedParentAccount(tx, email, talentId);
    if (!orphan) continue;

    await tx.bauth_user.update({
      where: { id: orphan.id },
      data: {
        name: 'Parent Anonymisé',
        image: null,
        email: `anonymized-parent-${orphan.id}@jump.internal`,
      },
    });
    await tx.bauth_session.deleteMany({ where: { userId: orphan.id } });
    await tx.bauth_account.deleteMany({ where: { userId: orphan.id } });
  }

  // The column scrub above only removes the app's *path* to the generated PDFs;
  // the objects still embed the student's and guardian's names + signature.
  // Return their keys so the caller can delete them once this transaction has
  // committed (see the function doc — external calls can't live inside the tx).
  return documentKeys;
}

/**
 * Best-effort deletion of the onboarding PDFs an {@link anonymizeTalent} run
 * dereferenced. Call this *after* the erasure transaction commits.
 *
 * Best-effort by design: the DB scrub is the legally-required step and has
 * already committed, so a storage hiccup must not surface as a failure that
 * looks like the erasure didn't happen — each delete is logged on failure for
 * manual cleanup rather than thrown. A leaked object is unreferenced (its
 * Talent columns are null) and keyed by a cuid + epoch-ms timestamp, so it
 * isn't reachable through the app; this just removes the residual file.
 */
export async function deleteAnonymizedDocuments(
  keys: readonly string[],
): Promise<void> {
  if (keys.length === 0) return;
  const storage = getStorage();
  await Promise.all(
    keys.map((key) =>
      storage
        .delete(key)
        .catch((e) =>
          console.error(`[anonymize] failed to delete document ${key}:`, e),
        ),
    ),
  );
}

export const AnonymizationService = {
  /**
   * Anonymizes student profiles that have been inactive for more than 18 months.
   * According to GDPR and project constraints, personal data is nullified or
   * replaced with placeholders while keeping anonymous activity records.
   */
  async anonymizeInactiveStudents() {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - DATA_RETENTION_MONTHS);

    // Find students inactive past the disclosed retention period (see
    // DATA_RETENTION_MONTHS), plus those never active but created before it.
    const inactiveStudents = await prisma.talent.findMany({
      where: {
        OR: [
          { lastActiveAt: { lt: cutoff } },
          {
            lastActiveAt: null,
            createdAt: { lt: cutoff },
          },
        ],
        // Don't anonymize already anonymized profiles
        NOT: {
          nom: 'Anonymisé',
          prenom: 'Anonymisé',
        },
      },
      select: { id: true },
    });

    if (inactiveStudents.length === 0) {
      return 0;
    }

    let count = 0;

    // One transaction per student so a single failure can't roll back the batch.
    for (const student of inactiveStudents) {
      try {
        const documentKeys = await prisma.$transaction((tx) =>
          anonymizeTalent(tx, student.id),
        );
        // Drop the dereferenced PDFs from storage once the scrub has committed.
        await deleteAnonymizedDocuments(documentKeys);
        count++;
      } catch (e) {
        // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
        console.error(`Failed to anonymize student ${student.id}:`, e);
      }
    }

    return count;
  },
};
