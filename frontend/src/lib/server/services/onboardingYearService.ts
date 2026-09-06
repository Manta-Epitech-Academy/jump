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
  type OnboardingDossierOnlyField,
  type OnboardingProjectedField,
} from '$lib/domain/talentOnboarding';

/**
 * The dossier fields a signature act may set: every projected field, derived
 * from the Prisma model through {@link ONBOARDING_PROJECTED_FIELDS} so a column
 * that exists on one side and not the other is a type error here rather than a
 * field that silently stops being written or projected.
 *
 * Plus {@link ONBOARDING_DOSSIER_ONLY_FIELDS}, the columns deliberately not
 * projected onto `Talent`. They are in the patch because setting them is part of
 * a signature act: an act pins the wording it committed to, and it voids the
 * current render (a guardian co-signing invalidates the single-signer règlement
 * PDF, a new image-rights decision invalidates that year's droit-à-l'image PDF)
 * in the same transaction that records it. The write-back of the new key is NOT
 * a signature act and does not come through here - `onboardingPdfJobService`
 * updates the row directly, so a background render never touches the projection.
 */
export type OnboardingRecordPatch = Partial<
  Pick<Onboarding_Record, OnboardingProjectedField | OnboardingDossierOnlyField>
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
 * The dossier a legal guardian's act belongs to: the one the projection
 * currently describes, never the year on the clock.
 *
 * The guardian is invited by their child's own progress, so the dossier they are
 * answering about is whichever one that child actually has. Resolving it from
 * the clock instead would file a co-signature or an image-rights decision taken
 * after the 31 July cutover against a year nobody opened, and the parent portal
 * would ask for it again the moment it was given.
 *
 * The fallback to the year in progress covers a talent with no dossier at all,
 * who cannot appear in the parent flow: it is there so an unexpected call opens
 * the right row rather than none.
 *
 * Shared by `parentRulesService` and `imageRightsService` so the two acts of one
 * parent session cannot land on different years.
 */
export async function guardianActSchoolYear(
  tx: Prisma.TransactionClient,
  talentId: string,
  timezone: string = 'Europe/Paris',
): Promise<string> {
  const talent = await tx.talent.findUniqueOrThrow({
    where: { id: talentId },
    select: { onboardingSchoolYear: true },
  });
  return talent.onboardingSchoolYear ?? currentSchoolYearLabel(timezone);
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
