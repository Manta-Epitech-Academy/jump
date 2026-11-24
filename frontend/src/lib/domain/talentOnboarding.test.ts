import { describe, it, expect } from 'vitest';
import {
  onboardingFieldsForYear,
  getOnboardingStep,
  stepBackPatch,
  ONBOARDING_GATES,
  type DatedOnboardingFields,
  type OnboardingStepFields,
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

/** A dossier with the given gates set and every other one null. */
function dossierWith(
  ...gates: (keyof OnboardingStepFields)[]
): OnboardingStepFields {
  const at = new Date('2026-09-01T10:00:00Z');
  return Object.fromEntries(
    ONBOARDING_GATES.map((gate) => [gate, gates.includes(gate) ? at : null]),
  ) as OnboardingStepFields;
}

describe('getOnboardingStep', () => {
  it('stops at the first step whose gates are not all set', () => {
    expect(getOnboardingStep(dossierWith())).toBe('identity');
    expect(getOnboardingStep(dossierWith('infoValidatedAt'))).toBe('school');
    expect(
      getOnboardingStep(
        dossierWith('infoValidatedAt', 'highSchoolValidatedAt'),
      ),
    ).toBe('parents');
    const toInterests = [
      'infoValidatedAt',
      'highSchoolValidatedAt',
      'parentsValidatedAt',
    ] as const;
    expect(getOnboardingStep(dossierWith(...toInterests))).toBe('interests');
    // Interests is done only once both of its timestamps are set.
    expect(
      getOnboardingStep(
        dossierWith(...toInterests, 'techInterestsValidatedAt'),
      ),
    ).toBe('interests');
    const toEquipment = [
      ...toInterests,
      'techInterestsValidatedAt',
      'generalInterestsValidatedAt',
    ] as const;
    expect(getOnboardingStep(dossierWith(...toEquipment))).toBe('equipment');
    expect(
      getOnboardingStep(dossierWith(...toEquipment, 'equipmentValidatedAt')),
    ).toBe('processing');
    expect(
      getOnboardingStep(
        dossierWith(
          ...toEquipment,
          'equipmentValidatedAt',
          'processingCompletedAt',
        ),
      ),
    ).toBe('rules');
    expect(getOnboardingStep(dossierWith(...ONBOARDING_GATES))).toBeNull();
  });

  it('resumes at the earliest gap of a non-monotonic dossier', () => {
    expect(
      getOnboardingStep(dossierWith('infoValidatedAt', 'rulesSignedAt')),
    ).toBe('school');
  });
});

describe('stepBackPatch', () => {
  it('rewinds to the last step a talent can land on, as the wizard always did', () => {
    expect(stepBackPatch(null)).toBeNull();
    expect(stepBackPatch('identity')).toBeNull();
    expect(stepBackPatch('school')).toEqual({ infoValidatedAt: null });
    expect(stepBackPatch('parents')).toEqual({ highSchoolValidatedAt: null });
    expect(stepBackPatch('interests')).toEqual({ parentsValidatedAt: null });
    expect(stepBackPatch('equipment')).toEqual({
      techInterestsValidatedAt: null,
      generalInterestsValidatedAt: null,
    });
    expect(stepBackPatch('processing')).toEqual({
      equipmentValidatedAt: null,
    });
    // `processing` re-submits itself on mount, so « Retour » from the rules
    // skips it back to the equipment step, clearing both.
    expect(stepBackPatch('rules')).toEqual({
      equipmentValidatedAt: null,
      processingCompletedAt: null,
    });
  });
});
