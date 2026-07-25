import { prisma } from '$lib/server/db';
import { Prisma } from '@prisma/client';
import { schoolYearOf } from '$lib/domain/schoolYear';

export type SchoolingSource = 'sync' | 'onboarding' | 'staff';

export interface UpsertSchoolingYearRecordInput {
  talentId: string;
  schoolYear: string; // e.g. "2026-2027"
  niveau?: string | null;
  schoolId?: string | null;
  source: SchoolingSource;
}

/**
 * Refreshes the `Talent.niveau` / `Talent.schoolId` cached projections from a
 * just-written record, but only when that record is the *current* school year's -
 * older years are history and must never move the projection. Takes the upserted
 * record so it doesn't re-read the row it was just handed.
 */
async function refreshTalentSchoolingProjection(
  tx: Prisma.TransactionClient,
  record: {
    talentId: string;
    schoolYear: string;
    niveau: string | null;
    schoolId: string | null;
  },
  timezone: string = 'Europe/Paris',
): Promise<void> {
  const currentSchoolYear = schoolYearOf(new Date(), timezone).label;
  if (record.schoolYear !== currentSchoolYear) return;

  await tx.talent.update({
    where: { id: record.talentId },
    data: { niveau: record.niveau, schoolId: record.schoolId },
  });
}

/**
 * Upserts a student's `Schooling_YearRecord` for a given school year and, when
 * that year is the current one, refreshes the `Talent.niveau`/`Talent.schoolId`
 * projections in the same transaction.
 *
 * On create, a field the caller omits is carried forward from the talent's
 * current value rather than defaulting to null: a partial upsert (e.g. onboarding
 * writing only `schoolId`) must never blank the other projected field. The
 * `update` branch already leaves omitted fields untouched. Pass `null` explicitly
 * to clear a field (what `resetTalentToImport` does).
 */
export async function upsertSchoolingYearRecord(
  clientOrTx: Prisma.TransactionClient | typeof prisma,
  input: UpsertSchoolingYearRecordInput,
  timezone: string = 'Europe/Paris',
) {
  const { talentId, schoolYear, source } = input;

  const run = async (tx: Prisma.TransactionClient) => {
    // Carry-forward source for any field the caller didn't supply on create.
    const talent = await tx.talent.findUniqueOrThrow({
      where: { id: talentId },
      select: { niveau: true, schoolId: true },
    });

    const record = await tx.schooling_YearRecord.upsert({
      where: { talentId_schoolYear: { talentId, schoolYear } },
      create: {
        talentId,
        schoolYear,
        niveau: input.niveau !== undefined ? input.niveau : talent.niveau,
        schoolId:
          input.schoolId !== undefined ? input.schoolId : talent.schoolId,
        source,
      },
      update: {
        ...(input.niveau !== undefined ? { niveau: input.niveau } : {}),
        ...(input.schoolId !== undefined ? { schoolId: input.schoolId } : {}),
        source,
      },
    });

    await refreshTalentSchoolingProjection(tx, record, timezone);

    return record;
  };

  if ('$transaction' in clientOrTx) {
    return (clientOrTx as typeof prisma).$transaction(run);
  }
  return run(clientOrTx as Prisma.TransactionClient);
}
