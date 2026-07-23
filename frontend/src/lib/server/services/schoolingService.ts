import { prisma } from '$lib/server/db';
import { Prisma } from '@prisma/client';
import { advanceNiveau } from '$lib/domain/niveau';
import { schoolYearOf } from '$lib/domain/schoolYear';

export type SchoolingSource = 'sync' | 'onboarding' | 'rollover' | 'staff';

export interface UpsertSchoolingYearRecordInput {
  talentId: string;
  schoolYear: string; // e.g. "2026-2027"
  niveau?: string | null;
  schoolId?: string | null;
  source: SchoolingSource | string;
}

/**
 * Recomputes `Talent.niveau` and `Talent.schoolId` projections for the active
 * current school year. If the updated record belongs to the current school year,
 * it refreshes the projection on `Talent` atomically in the same transaction.
 */
async function refreshTalentSchoolingProjection(
  tx: Prisma.TransactionClient,
  talentId: string,
  targetSchoolYear: string,
  timezone: string = 'Europe/Paris',
): Promise<void> {
  const currentSchoolYear = schoolYearOf(new Date(), timezone).label;
  if (targetSchoolYear !== currentSchoolYear) {
    return;
  }

  const currentRecord = await tx.schooling_YearRecord.findUnique({
    where: { talentId_schoolYear: { talentId, schoolYear: currentSchoolYear } },
  });

  if (currentRecord) {
    await tx.talent.update({
      where: { id: talentId },
      data: {
        niveau: currentRecord.niveau,
        schoolId: currentRecord.schoolId,
      },
    });
  }
}

/**
 * Upserts a student's `Schooling_YearRecord` for a specific school year and
 * transactionally updates `Talent.niveau`/`Talent.schoolId` cached projections if
 * the record matches the current active school year.
 */
export async function upsertSchoolingYearRecord(
  clientOrTx: Prisma.TransactionClient | typeof prisma,
  input: UpsertSchoolingYearRecordInput,
  timezone: string = 'Europe/Paris',
) {
  const { talentId, schoolYear, source } = input;

  const run = async (tx: Prisma.TransactionClient) => {
    const record = await tx.schooling_YearRecord.upsert({
      where: { talentId_schoolYear: { talentId, schoolYear } },
      create: {
        talentId,
        schoolYear,
        niveau: input.niveau !== undefined ? input.niveau : null,
        schoolId: input.schoolId !== undefined ? input.schoolId : null,
        source,
      },
      update: {
        ...(input.niveau !== undefined ? { niveau: input.niveau } : {}),
        ...(input.schoolId !== undefined ? { schoolId: input.schoolId } : {}),
        source,
      },
    });

    await refreshTalentSchoolingProjection(tx, talentId, schoolYear, timezone);

    return record;
  };

  if ('$transaction' in clientOrTx) {
    return (clientOrTx as typeof prisma).$transaction(run);
  }
  return run(clientOrTx as Prisma.TransactionClient);
}

/**
 * Annual school-year rollover job.
 * Finds all talents with a `Schooling_YearRecord` in previous year N who do not yet
 * have a record in year N+1. Creates the N+1 record with `niveau` advanced one step
 * (via `advanceNiveau`) and carried-over `schoolId`.
 *
 * Idempotent: safe to run multiple times.
 */
export async function rolloverSchoolYear(
  clientOrTx: Prisma.TransactionClient | typeof prisma = prisma,
  now: Date = new Date(),
  timezone: string = 'Europe/Paris',
): Promise<{ processedCount: number; createdCount: number }> {
  const currentSY = schoolYearOf(now, timezone);
  const currentSchoolYearLabel = currentSY.label;
  const previousSchoolYearLabel = `${currentSY.startYear - 1}-${currentSY.startYear}`;

  const run = async (tx: Prisma.TransactionClient) => {
    const previousRecords = await tx.schooling_YearRecord.findMany({
      where: { schoolYear: previousSchoolYearLabel },
    });

    const currentRecords = await tx.schooling_YearRecord.findMany({
      where: { schoolYear: currentSchoolYearLabel },
      select: { talentId: true },
    });
    const existingTalentIds = new Set(currentRecords.map((r) => r.talentId));

    let createdCount = 0;

    for (const prevRecord of previousRecords) {
      if (existingTalentIds.has(prevRecord.talentId)) {
        continue;
      }

      const nextNiveau = advanceNiveau(prevRecord.niveau);

      await tx.schooling_YearRecord.create({
        data: {
          talentId: prevRecord.talentId,
          schoolYear: currentSchoolYearLabel,
          niveau: nextNiveau,
          schoolId: prevRecord.schoolId,
          source: 'rollover',
        },
      });

      await tx.talent.update({
        where: { id: prevRecord.talentId },
        data: {
          niveau: nextNiveau,
          schoolId: prevRecord.schoolId,
        },
      });

      createdCount++;
    }

    return {
      processedCount: previousRecords.length,
      createdCount,
    };
  };

  if ('$transaction' in clientOrTx) {
    return (clientOrTx as typeof prisma).$transaction(run);
  }
  return run(clientOrTx as Prisma.TransactionClient);
}
