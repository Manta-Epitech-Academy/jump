import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';

export const AnonymizationService = {
  /**
   * Anonymizes student profiles that have been inactive for more than 18 months.
   * According to GDPR and project constraints, personal data is nullified or
   * replaced with placeholders while keeping anonymous activity records.
   */
  async anonymizeInactiveStudents() {
    const eighteenMonthsAgo = new Date();
    eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);

    // Find all students who haven't been active for 18 months
    // We also check for students who were never active but created 18+ months ago
    const inactiveStudents = await prisma.studentProfile.findMany({
      where: {
        OR: [
          { lastActiveAt: { lt: eighteenMonthsAgo } },
          {
            lastActiveAt: null,
            createdAt: { lt: eighteenMonthsAgo },
          },
        ],
        // Don't anonymize already anonymized profiles
        NOT: {
          nom: 'Anonymisé',
          prenom: 'Anonymisé',
        },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (inactiveStudents.length === 0) {
      return 0;
    }

    let count = 0;

    // Use a transaction for each student to ensure consistency
    for (const student of inactiveStudents) {
      try {
        await prisma.$transaction(async (tx) => {
          // 1. Update StudentProfile — clear all PII fields
          await tx.studentProfile.update({
            where: { id: student.id },
            data: {
              nom: 'Anonymisé',
              prenom: 'Anonymisé',
              salesforceId: null,
              phone: null,
              parentPhone: null,
              parentEmail: null,
              niveau: null,
              niveauDifficulte: null,
              badges: Prisma.DbNull,
              lastSyncedAt: null,
              charterAcceptedAt: null,
              // We keep xp, level, and eventsCount for aggregate stats
            },
          });

          // 2. Update User (BetterAuth table)
          await tx.bauth_user.update({
            where: { id: student.userId },
            data: {
              name: 'Utilisateur Anonymisé',
              image: null,
              email: `anonymized-${student.id}@tekcamp.internal`,
            },
          });

          // 3. Clear sessions and auth accounts
          await tx.bauth_session.deleteMany({
            where: { userId: student.userId },
          });
          await tx.bauth_account.deleteMany({
            where: { userId: student.userId },
          });

          // 4. Delete portfolio items (student-created content with potential PII)
          await tx.portfolioItem.deleteMany({
            where: { studentProfileId: student.id },
          });
        });
        count++;
      } catch (e) {
        console.error(`Failed to anonymize student ${student.id}:`, e);
      }
    }

    return count;
  },
};
