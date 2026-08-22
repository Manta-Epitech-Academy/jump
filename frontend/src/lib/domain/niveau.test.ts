import { describe, it, expect } from 'vitest';
import {
  NIVEAUX,
  COLLEGE_NIVEAUX,
  isOnboardingEligible,
  compareNiveaux,
} from './niveau';

/**
 * `isOnboardingEligible` is a regulatory gate: it decides who is sent through
 * the wizard that collects a minor's data and their guardian's contact, and who
 * is counted in the onboarding aggregates. Both error directions are asserted,
 * because they are not symmetric (see the helper's own doc).
 */
describe('onboarding eligibility by niveau', () => {
  it('excludes exactly the four collège levels', () => {
    expect([...COLLEGE_NIVEAUX]).toEqual(['6eme', '5eme', '4eme', '3eme']);
    for (const n of COLLEGE_NIVEAUX) {
      expect(isOnboardingEligible(n)).toBe(false);
    }
  });

  it('includes every level from seconde up', () => {
    const lycéeAndAbove = NIVEAUX.filter((n) => !COLLEGE_NIVEAUX.includes(n));
    expect(lycéeAndAbove).toContain('2nde');
    for (const n of lycéeAndAbove) {
      expect(isOnboardingEligible(n)).toBe(true);
    }
  });

  it('fails open on an unknown or unset level', () => {
    // An unset niveau is more likely a lycée prospect whose sync has not landed
    // than a collégien, and denying a dossier fails silently while granting one
    // does not.
    expect(isOnboardingEligible(null)).toBe(true);
    expect(isOnboardingEligible(undefined)).toBe(true);
    expect(isOnboardingEligible('autre')).toBe(true);
    expect(isOnboardingEligible('cinquieme')).toBe(true);
  });

  it('keeps the collège slice anchored to the catalogue order', () => {
    // COLLEGE_NIVEAUX is a slice, so this guards an insertion at the head of
    // NIVEAUX silently shifting who is excluded.
    expect(NIVEAUX.slice(0, 4)).toEqual([...COLLEGE_NIVEAUX]);
    expect(compareNiveaux('3eme', '2nde')).toBeLessThan(0);
  });
});
