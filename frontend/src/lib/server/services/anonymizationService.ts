import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { DATA_RETENTION_MONTHS } from '$lib/domain/retention';

/**
 * The single GDPR-erasure primitive. Clears a talent's PII in place rather than
 * deleting rows: name/contact fields are nulled or replaced with placeholders,
 * the linked auth identity is scrubbed and its sessions/accounts dropped, and
 * portfolio content (which can embed PII) is removed. We deliberately keep
 * `xp`, `level` and `eventsCount` so aggregate stats survive the erasure.
 *
 * Parents are data subjects too: their identity lives both as columns on the
 * Talent (both guardian slots) and as a `bauth_user` (role `parent`) minted at
 * onboarding so they can sign image rights. Both are erased here. The parent
 * account is shared across siblings (it is keyed by email and reused), so its
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
 */
export async function anonymizeTalent(
  tx: Prisma.TransactionClient,
  talentId: string,
): Promise<void> {
  const talent = await tx.talent.findUnique({
    where: { id: talentId },
    select: { userId: true, parentEmail: true, parent2Email: true },
  });
  if (!talent) return;

  // Captured before the update below nulls them, so we can scrub the matching
  // parent accounts afterwards (step 4).
  const parentEmails = [talent.parentEmail, talent.parent2Email].filter(
    (e): e is string => !!e,
  );

  // 1. Clear all PII fields on the Talent (keep xp / level / eventsCount),
  //    including both parent/guardian slots.
  await tx.talent.update({
    where: { id: talentId },
    data: {
      nom: 'Anonymisé',
      prenom: 'Anonymisé',
      email: null,
      externalId: null,
      phone: null,
      niveau: null,
      badges: Prisma.DbNull,
      lastSyncedAt: null,
      charterAcceptedAt: null,
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
    },
  });

  // 2. Scrub the linked BetterAuth user and revoke its access — only if linked.
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

  // 3. Delete portfolio items (student-created content with potential PII).
  await tx.portfolioItem.deleteMany({ where: { talentId } });

  // 4. Scrub the parent `bauth_user`(s) — but only those no other talent still
  //    references, so a shared parent (siblings) keeps their account. Already-
  //    anonymised siblings have null parent emails, so they never count here.
  for (const email of new Set(parentEmails)) {
    const stillReferenced = await tx.talent.count({
      where: {
        id: { not: talentId },
        OR: [{ parentEmail: email }, { parent2Email: email }],
      },
    });
    if (stillReferenced > 0) continue;

    const parentUser = await tx.bauth_user.findUnique({ where: { email } });
    if (!parentUser || parentUser.role !== 'parent') continue;

    await tx.bauth_user.update({
      where: { id: parentUser.id },
      data: {
        name: 'Parent Anonymisé',
        image: null,
        email: `anonymized-parent-${parentUser.id}@jump.internal`,
      },
    });
    await tx.bauth_session.deleteMany({ where: { userId: parentUser.id } });
    await tx.bauth_account.deleteMany({ where: { userId: parentUser.id } });
  }
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
        await prisma.$transaction((tx) => anonymizeTalent(tx, student.id));
        count++;
      } catch (e) {
        console.error(`Failed to anonymize student ${student.id}:`, e);
      }
    }

    return count;
  },
};
