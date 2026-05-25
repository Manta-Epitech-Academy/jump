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
 * This is the *real* deletion mechanism behind both entry points:
 *   - the daily inactivity sweep (`anonymizeInactiveStudents`), and
 *   - a talent's own deletion request once staff fulfil it
 *     (`talentDeletionService.fulfillTalentDeletion`).
 *
 * Idempotent: re-running on an already-anonymised talent is a harmless no-op
 * write. Takes a transaction client so callers can bundle it with their own
 * bookkeeping (e.g. flipping a deletion request to `fulfilled`) atomically.
 */
export async function anonymizeTalent(
  tx: Prisma.TransactionClient,
  talentId: string,
): Promise<void> {
  const talent = await tx.talent.findUnique({
    where: { id: talentId },
    select: { userId: true },
  });
  if (!talent) return;

  // 1. Clear all PII fields on the Talent (keep xp / level / eventsCount).
  await tx.talent.update({
    where: { id: talentId },
    data: {
      nom: 'Anonymisé',
      prenom: 'Anonymisé',
      externalId: null,
      phone: null,
      parentPhone: null,
      parentEmail: null,
      niveau: null,
      badges: Prisma.DbNull,
      lastSyncedAt: null,
      charterAcceptedAt: null,
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
