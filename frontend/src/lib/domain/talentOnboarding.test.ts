import { describe, it, expect } from 'vitest';
import {
  onboardingFieldsForYear,
  getOnboardingStep,
  type DatedOnboardingFields,
} from './talentOnboarding';

/**
 * Reading a dated projection. The rest of the ladder is exercised through the
 * funnel and the guards; what is pinned here is the part of the contract nothing
 * else can reach - which fields survive a year change, and which keys the
 * function is allowed to put on the object it hands back.
 */
describe('onboardingFieldsForYear', () => {
  const t = new Date('2026-03-01T10:00:00Z');

  const finished: DatedOnboardingFields = {
    onboardingSchoolYear: '2025-2026',
    charterAcceptedAt: t,
    infoValidatedAt: t,
    highSchoolValidatedAt: t,
    parentsValidatedAt: t,
    techInterestsValidatedAt: t,
    generalInterestsValidatedAt: t,
    equipmentValidatedAt: t,
    processingCompletedAt: t,
    rulesSignedAt: t,
  };

  it('hands back the dossier untouched for its own year', () => {
    const same = onboardingFieldsForYear(finished, '2025-2026');
    expect(getOnboardingStep(same)).toBeNull();
    expect(same.rulesSignedAt).toBe(t);
  });

  it('reads another year as nothing done, charte excepted', () => {
    const other = onboardingFieldsForYear(finished, '2026-2027');
    expect(getOnboardingStep(other)).toBe('identity');
    expect(other.rulesSignedAt).toBeNull();
    // Once per account, so it survives the year change and the returning talent
    // is never asked to accept it again.
    expect(other.charterAcceptedAt).toBe(t);
  });

  it('nulls only the keys it was given, never inventing one', () => {
    // A caller that selected a narrow slice must get that slice back. Blanking
    // a field it never queried would read downstream as "not signed" rather than
    // "not asked for" - the guardian co-signature being the one that matters.
    const slice = {
      onboardingSchoolYear: '2025-2026',
      charterAcceptedAt: t,
      infoValidatedAt: t,
      highSchoolValidatedAt: null,
      parentsValidatedAt: null,
      techInterestsValidatedAt: null,
      generalInterestsValidatedAt: null,
      equipmentValidatedAt: null,
      processingCompletedAt: null,
      rulesSignedAt: null,
    };
    const other = onboardingFieldsForYear(slice, '2026-2027');
    expect('parentRulesSignedAt' in other).toBe(false);
    expect('reglementVersion' in other).toBe(false);
  });

  it('treats a talent who never started as having no dossier', () => {
    const fresh: DatedOnboardingFields = {
      ...finished,
      onboardingSchoolYear: null,
    };
    expect(getOnboardingStep(onboardingFieldsForYear(fresh, '2026-2027'))).toBe(
      'identity',
    );
  });
});
