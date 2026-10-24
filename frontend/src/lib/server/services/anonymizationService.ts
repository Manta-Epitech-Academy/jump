import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { findUnreferencedParentAccount } from '$lib/server/services/parentAccount';
import {
  clearLegacyDocumentKeys,
  deleteDocumentObjects,
  documentKeysOf,
  TALENT_DOCUMENT_KEYS_SELECT,
} from '$lib/server/services/onboardingDocuments';
import { DATA_RETENTION_MONTHS } from '$lib/domain/retention';
import {
  clearGuardianActs,
  clearOnboardingTimestamps,
  clearTalentOnboardingArtifacts,
} from '$lib/domain/talentOnboarding';
import { clearGuardianContacts, guardianEmailsOf } from '$lib/domain/contact';

/**
 * The single GDPR-erasure primitive. Clears a talent's PII in place rather than
 * deleting rows: name/contact fields are nulled or replaced with placeholders,
 * the linked auth identity is scrubbed and its sessions/accounts dropped, and
 * every talent-scoped satellite that embeds a name, a contact detail, or free
 * text (closings, comm + send history) is deleted outright, along with the
 * PDF-job queue trace. The generated onboarding PDFs (charte / règlement student /
 * règlement parent / droit à l'image, each embeds the student's and guardian's
 * names and a signature) are deleted from object storage, not merely
 * dereferenced. We deliberately keep the de-identified behavioural telemetry
 * (participation, EventPresence, minigame attempts, the xp ledger, the CTFd
 * activity mirrors) so `xp`, `eventsCount` and aggregate stats survive the
 * erasure, and with them the talent's `firstLoginAt` / `lastActiveAt`: the
 * retention figures read them (the "connected" count of the cohort profile, the
 * population of feature usage), and with the name gone they identify nobody.
 *
 * What it does to each table and each `Talent` column is classified, with the
 * reason, in `talentScopedData.integration.test.ts`, which fails on a table or a
 * column nobody has classified: a new one is decided there first.
 *
 * The talent's accounts on the CTFd activity instances are not reached from
 * here: each instance asks Jump which of its accounts belong to an erased talent
 * (`/api/workshops/erasures`, answered from `Talent.anonymizedAt`, which this
 * function stamps) and deletes them itself. A pull rather than a call from this
 * transaction, so an instance that is down when the erasure runs still deletes
 * the account the next time it asks.
 *
 * Parents are data subjects too: their identity lives both as columns on the
 * Talent (both guardian slots, plus the guardian's typed signer name on the
 * image-rights decision and on the règlement co-signature) and as a
 * `bauth_user` (role `parent`) minted at onboarding so they can sign image
 * rights and co-sign the règlement. Both are erased here. The parent account
 * is shared across siblings (it is keyed by email and reused), so its
 * `bauth_user` is only scrubbed once no *other* talent still references that
 * email, otherwise a sibling's parent would lose their login.
 *
 * This is the *real* deletion mechanism behind both entry points:
 *   - the daily inactivity sweep (`anonymizeInactiveStudents`), and
 *   - a talent's own deletion request once staff fulfil it
 *     (`talentDeletionService.fulfillTalentDeletion`), which alone also bars
 *     the Salesforce contact from being imported again (`Sync_ErasedContact`).
 *
 * Idempotent: re-running on an already-anonymised talent is a harmless no-op
 * write (its parent emails are already null, so nothing is re-resolved). Takes
 * a transaction client so callers can bundle it with their own bookkeeping
 * (e.g. flipping a deletion request to `fulfilled`) atomically.
 *
 * Returns the S3 keys of the onboarding PDFs it dereferenced. The objects must
 * be deleted from storage to complete the erasure, but that's an external call:
 * it cannot run inside the transaction (it would risk the interactive-tx
 * timeout rolling back the legally-required scrub). Callers hand the keys to
 * {@link deleteDocumentObjects} *after* the transaction commits.
 */
export async function anonymizeTalent(
  tx: Prisma.TransactionClient,
  talentId: string,
): Promise<string[]> {
  const talent = await tx.talent.findUnique({
    where: { id: talentId },
    select: {
      userId: true,
      anonymizedAt: true,
      externalId: true,
      user: { select: { email: true } },
      parentEmail: true,
      parent2Email: true,
      // Every key the onboarding PDFs may sit under, every year's dossier and
      // the retired columns alike: a key missed here is a named minor's PDF
      // left in the bucket with nothing pointing at it.
      ...TALENT_DOCUMENT_KEYS_SELECT,
    },
  });
  if (!talent) return [];

  // Captured before the update below nulls them, so we can scrub the matching
  // parent accounts afterwards (step 4).
  const parentEmails = guardianEmailsOf(talent);

  // S3 keys of the generated onboarding PDFs, captured before the update and the
  // dossier deletion drop the references. Returned to the caller, which deletes
  // the objects post-commit.
  const documentKeys = documentKeysOf(talent);

  // 1. Clear all PII fields on the Talent (keep xp / eventsCount), including
  //    both parent/guardian slots and every onboarding-state timestamp (those
  //    are behavioural metadata about a real person's progression: the
  //    anonymised row must not carry a timeline).
  await tx.talent.update({
    where: { id: talentId },
    data: {
      ...clearOnboardingTimestamps(),
      // The fact that the erasure happened, kept from the first run so a re-run
      // does not move it. Everything that needs to know "is this talent erased"
      // reads this, never the placeholder name below.
      anonymizedAt: talent.anonymizedAt ?? new Date(),
      nom: 'Anonymisé',
      prenom: 'Anonymisé',
      externalId: null,
      phone: null,
      civilite: null,
      highSchoolNameManual: null,
      schoolId: null,
      interestsFreeText: null,
      setupDescription: null,
      // The guardian's two signed acts, the image-rights decision and the
      // règlement co-signature: their typed name, relationship and city are the
      // guardian's PII, and the timestamps move with them (each is one signed
      // fact). The PDFs embedding them are deleted post-commit (keys below).
      ...clearGuardianActs(),
      // Talent-owned onboarding signature artifacts (the talent's place of
      // signature, the règlement version and the onboarding year). Shared with
      // the admin reset via the canonical list so a new artifact scrubs on both
      // paths.
      ...clearTalentOnboardingArtifacts(),
      // The two legacy PDF keys, captured above for post-commit deletion: a key
      // left here would name an object that no longer exists.
      ...clearLegacyDocumentKeys(),
      // Both guardians: data subjects too.
      ...clearGuardianContacts(),
      niveau: null,
    },
  });

  // 2. Delete every talent-scoped satellite row that carries identifying
  //    content. Counterpart to the in-place scrub above: where a record embeds
  //    a name, a contact detail, or free text, the whole row is removed rather
  //    than nulled field-by-field (drift-proof as columns are added, and very
  //    nearly the same set resetTalentToImport wipes: schooling_YearRecord is
  //    the one row erased here but kept there, see below). The anonymous
  //    behavioural telemetry is deliberately KEPT (participation,
  //    eventPresence, minigameAttempt, xpGrant, workshop_Participation): once
  //    the name is gone those are de-identified activity backing xp /
  //    eventsCount and aggregate stats.
  //      - talentSfImport / talentInterest / imageRightsDecisionRecord: the SF
  //        mirror, interest selections, and the image-rights ledger (the ledger
  //        embeds the guardian's typed signer name).
  //      - schooling_YearRecord: which lycée a named minor attended, year by
  //        year. Erasure is total here (all years), unlike resetTalentToImport,
  //        which keeps the history (a re-onboard is not an erasure).
  //      - onboarding_Record: the per-year sign-up dossier. It embeds the
  //        guardian's typed signer name and both signatories' place of
  //        signature. Total here too; resetTalentToImport drops it as well, for
  //        a different reason (the dossier is the sign-up a reset voids).
  //      - note_TalentNote: staff notes about the minor (pedago + administratif
  //        free text). The whole feed is removed on erasure.
  //      - closing_Record / closing_ResetEvent: the record and its answers hold
  //        free-text staff observations about the minor (the verdict note and a
  //        note per question); both existing wipe paths hard-delete it, and the
  //        answers cascade with the record. Closing_ResetEvent is a reset's audit
  //        trace + reason.
  //      - onboardingPdfJob: the queue trace of every document ever rendered
  //        for this minor. It stopped snapshotting their name when the payload
  //        column was retired, so what is erased here is the trace itself: which
  //        documents were produced, for which years, and when. The generated S3
  //        PDFs are deleted post-commit.
  //      - broadcastRecipient: the talent's and the parent's email / phone per
  //        send, matched on both slots (SetNull relations, so deleted here, not
  //        left orphaned). The parent is a data subject too.
  await tx.talentSfImport.deleteMany({ where: { talentId } });
  await tx.talentInterest.deleteMany({ where: { talentId } });
  await tx.schooling_YearRecord.deleteMany({ where: { talentId } });
  await tx.onboarding_Record.deleteMany({ where: { talentId } });
  await tx.imageRightsDecisionRecord.deleteMany({ where: { talentId } });
  await tx.note_TalentNote.deleteMany({ where: { talentId } });
  // feedback_Submission: the talent's bilan answers embed free-text opinions
  // (textarea questions), identifying content, so the whole submission is
  // removed (cascades to its answers + selected options). A public bilan response
  // carries no talentId until reconciled, yet stores the respondent's self-typed
  // e-mail / phone / name, so it is also matched by the talent's own e-mail and
  // erased the same way (case-insensitive: the public form takes free input).
  await tx.feedback_Submission.deleteMany({
    where: {
      OR: [
        { talentId },
        ...(talent.user?.email
          ? [
              {
                talentId: null,
                respondentEmail: {
                  equals: talent.user.email,
                  mode: 'insensitive' as const,
                },
              },
            ]
          : []),
      ],
    },
  });
  // Answers and their option rows cascade from the record, so this one delete
  // takes the whole closing with it.
  await tx.closing_Record.deleteMany({ where: { talentId } });
  await tx.closing_ResetEvent.deleteMany({ where: { talentId } });
  await tx.onboardingPdfJob.deleteMany({ where: { talentId } });
  await tx.broadcastRecipient.deleteMany({
    where: { OR: [{ talentId }, { parentOfTalentId: talentId }] },
  });
  // syncError: what the Salesforce sync could not reconcile, logged with the
  // contact's name and address and keyed by no foreign key, so it is matched on
  // the identity read above (the update nulled the id): the talent's Salesforce
  // id on either side of a conflict, and the address they log in with, which is
  // what a row names when another contact claimed it (that row's message quotes
  // the holder's Salesforce id too).
  const syncErrorOf = [
    ...(talent.externalId
      ? [
          { attemptedExtId: talent.externalId },
          { existingExtId: talent.externalId },
        ]
      : []),
    ...(talent.user?.email
      ? [{ email: { equals: talent.user.email, mode: 'insensitive' as const } }]
      : []),
  ];
  if (syncErrorOf.length > 0) {
    await tx.syncError.deleteMany({ where: { OR: syncErrorOf } });
  }

  // Scrub residual PII fields in operational audit logs for this talent:
  //   - AuthIdentityRepair: retains fromEmail/toEmail; replace with anonymized placeholders.
  //   - TalentDeletionRequest: retains reason and resolutionNote; set both to null.
  await tx.authIdentityRepair.updateMany({
    where: { talentId },
    data: {
      fromEmail: 'anonyme@anonyme.invalid',
      toEmail: 'anonyme@anonyme.invalid',
    },
  });
  await tx.talentDeletionRequest.updateMany({
    where: { talentId },
    data: {
      reason: null,
      resolutionNote: null,
    },
  });

  // 3. Scrub the linked BetterAuth user and revoke its access, only if linked.
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

  // 4. Scrub the parent `bauth_user`(s), but only those no other talent still
  //    references, so a shared parent (siblings) keeps their account. Already-
  //    anonymised siblings have null parent emails, so they never count here.
  //    The sibling + role guard is shared with resetTalentToImport; here we
  //    scrub to a placeholder rather than delete (RGPD erasure keeps the row).
  for (const email of parentEmails) {
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
  // committed (see the function doc: external calls can't live inside the tx).
  return documentKeys;
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
        anonymizedAt: null,
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
        await deleteDocumentObjects(documentKeys);
        count++;
      } catch (e) {
        // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
        console.error(`Failed to anonymize student ${student.id}:`, e);
      }
    }

    return count;
  },
};
