/**
 * Per-talent platform-onboarding status, used by the student detail card.
 *
 * The "platform onboarding" journey (login → fill info → sign règlement
 * intérieur online) overlaps too much with the staff-validated admin docs
 * to be meaningful as a cohort-level metric — `stageCompliance.charteSigned`
 * already covers the same artifact and additionally tracks paper signatures.
 * The signal stays interesting on a *single* talent's profile (e.g. "did this
 * person make it past the welcome email?"), so this module is scoped to that
 * one use.
 */

export type TalentOnboardingStatus = 'not-ready' | 'done';

export type TalentOnboardingFields = {
  lastActiveAt: Date | string | null;
  infoValidatedAt: Date | string | null;
  rulesSignedAt: Date | string | null;
  charterAcceptedAt: Date | string | null;
};

export function deriveOnboardingStatus(
  talent: TalentOnboardingFields,
): TalentOnboardingStatus {
  if (
    talent.infoValidatedAt != null &&
    talent.rulesSignedAt != null &&
    talent.charterAcceptedAt != null
  ) {
    return 'done';
  }
  return 'not-ready';
}
