/**
 * Writes to a talent's per-school-year onboarding dossier, and the projection it
 * feeds.
 *
 * Same contract as `schoolingService`, deliberately: takes a
 * `Prisma.TransactionClient` and never opens its own transaction, so the fact
 * (`Onboarding_Record`) and the cached projection (the flat columns on `Talent`)
 * always land together. Callers holding the bare client wrap in
 * `prisma.$transaction` themselves.
 *
 * The one behavioural difference from schooling is the whole point of the model:
 * **nothing is carried forward**. A new year's dossier is created blank, so a
 * returning talent re-walks the ladder and re-signs the current règlement instead
 * of inheriting last year's timestamps.
 */

import type { Prisma, Onboarding_Record } from '@prisma/client';
import { currentSchoolYearLabel } from '$lib/domain/schoolYear';
import {
  ONBOARDING_PROJECTED_FIELDS,
  type OnboardingProjectedField,
} from '$lib/domain/talentOnboarding';

/**
 * The dossier fields a step may set. Derived from the Prisma model through
 * {@link ONBOARDING_PROJECTED_FIELDS}, so a column that exists on one side and
 * not the other is a type error here rather than a field that silently stops
 * being written or projected.
 */
export type OnboardingRecordPatch = Partial<
  Pick<Onboarding_Record, OnboardingProjectedField>
>;

export interface UpsertOnboardingYearRecordInput {
  talentId: string;
  schoolYear: string;
  /**
   * Fields to set on the dossier. An omitted field is left untouched on update
   * and stays null on create - the wizard patches one step at a time, and a
   * fresh year must not inherit the previous one.
   */
  patch: OnboardingRecordPatch;
}

/**
 * Copies a just-written dossier onto `Talent`, but only when it is the talent's
 * MOST RECENT one: an older year is history and must never move the projection.
 *
 * Note what the test is not: "is this the current year". The two differ exactly
 * when a talent's latest dossier is already behind the clock, and there the
 * clock-based test would be wrong rather than merely conservative. A guardian
 * who co-signs after the 31 July cutover writes to the dossier their child
 * actually has; skipping the refresh would leave `parentRulesSignedAt` null on
 * the row the parent portal reads, so it would ask them to co-sign again, for
 * ever. The projection means "the most recent dossier", so the rule that
 * maintains it says the same thing. The clock belongs on the read side, where it
 * decides whether that dossier is still the one that counts.
 *
 * School-year labels are fixed-width `YYYY-YYYY`, so they order chronologically
 * as strings.
 *
 * The copy is wholesale, not a patch of the changed field: when a new year's
 * dossier takes over, last year's values have to leave the projection, and
 * copying only what changed would strand them there. `onboardingSchoolYear` is
 * written in the same statement, so the projection and the year it describes can
 * never disagree.
 */
async function refreshTalentOnboardingProjection(
  tx: Prisma.TransactionClient,
  record: Onboarding_Record,
): Promise<void> {
  const talent = await tx.talent.findUniqueOrThrow({
    where: { id: record.talentId },
    select: { onboardingSchoolYear: true },
  });
  if (
    talent.onboardingSchoolYear != null &&
    talent.onboardingSchoolYear > record.schoolYear
  ) {
    return;
  }

  const projection = Object.fromEntries(
    ONBOARDING_PROJECTED_FIELDS.map((f) => [f, record[f]]),
  ) as Pick<Onboarding_Record, OnboardingProjectedField>;

  await tx.talent.update({
    where: { id: record.talentId },
    data: { ...projection, onboardingSchoolYear: record.schoolYear },
  });
}

/**
 * Upserts a talent's dossier for a school year and, when that dossier is their
 * most recent, refreshes the flat projection on `Talent` in the same transaction.
 */
export async function upsertOnboardingYearRecord(
  tx: Prisma.TransactionClient,
  input: UpsertOnboardingYearRecordInput,
): Promise<Onboarding_Record> {
  const { talentId, schoolYear, patch } = input;

  const record = await tx.onboarding_Record.upsert({
    where: { talentId_schoolYear: { talentId, schoolYear } },
    create: { talentId, schoolYear, ...patch },
    update: patch,
  });

  await refreshTalentOnboardingProjection(tx, record);

  return record;
}

/**
 * Convenience wrapper for the wizard, whose every step patches the dossier of
 * the year in progress. Spelled out so no step has to resolve the year itself -
 * a step that resolved it differently would file its timestamp on another row
 * than its neighbours.
 */
export function patchCurrentOnboardingRecord(
  tx: Prisma.TransactionClient,
  talentId: string,
  patch: OnboardingRecordPatch,
  timezone: string = 'Europe/Paris',
): Promise<Onboarding_Record> {
  return upsertOnboardingYearRecord(tx, {
    talentId,
    schoolYear: currentSchoolYearLabel(timezone),
    patch,
  });
}
