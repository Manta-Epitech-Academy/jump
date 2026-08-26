import { describe, it, expect } from 'vitest';
import {
  imageRightsStance,
  imageRightsStatus,
  imageRightsDisplayStatus,
  priorYearDecision,
} from './imageRights';

/**
 * The image-rights decision became annual: it is redemandée every school year,
 * so a talent's dossier goes back to undecided when they reopen one. That makes
 * the three-state status a question about a DOSSIER, and it leaves one question
 * it can no longer answer: may this student be photographed today.
 *
 * `imageRightsStance` is that answer, and this file is the reason it exists. A
 * consent expires; an interdiction does not. Every case below is one a real
 * cohort produces on the 31 July cutover.
 */
describe('image rights stance', () => {
  it('authorizes only on an explicit yes for the dossier in hand', () => {
    expect(imageRightsStance('accepted', 'accepted')).toBe('authorized');
    expect(imageRightsStance('accepted', 'refused')).toBe('authorized');
  });

  it('forbids on an explicit no for the dossier in hand', () => {
    expect(imageRightsStance('refused', 'refused')).toBe('forbidden');
    expect(imageRightsStance('refused', 'accepted')).toBe('forbidden');
  });

  it('keeps forbidding on a refusal whose school year has closed', () => {
    // THE case. In September the dossier is undecided again for everyone who
    // came back, so reading the dossier alone drops the marker off the badge of
    // a student whose guardian said no. Nothing would report it: the sheet just
    // prints without the marker.
    expect(imageRightsStance('undecided', 'refused')).toBe('forbidden');
  });

  it('does not treat a lapsed authorization as an authorization', () => {
    // Last year's yes does not cover this year's photo, so this is `unknown`,
    // never `authorized`. It is also not `forbidden`: nobody said no, and the
    // guardian is being asked.
    expect(imageRightsStance('undecided', 'accepted')).toBe('unknown');
  });

  it('is unknown when no guardian ever decided anything', () => {
    expect(imageRightsStance('undecided', null)).toBe('unknown');
  });

  it('never reads a refusal as an absence of answer', () => {
    // The status side of the same rule: `refused` is a settled decision, and
    // any code folding it into "still to chase" would ask a family that already
    // answered, and would let a photo out in the meantime.
    expect(imageRightsStatus({ imageRightsDecision: 'refused' })).toBe(
      'refused',
    );
    expect(imageRightsDisplayStatus('refused', false)).toBe('refused');
  });
});

/**
 * What the parent form reminds a guardian of, which is not the same question as
 * the stance. Both parent surfaces render the same form, and one of them renders
 * it on a decision still in force, so the reminder has to be able to say "this is
 * not a previous year's answer".
 */
describe('prior-year decision', () => {
  const lastYear = { decision: 'refused' as const, schoolYear: '2025-2026' };

  it('recalls a decision taken for another year', () => {
    expect(priorYearDecision(lastYear, '2026-2027')).toEqual(lastYear);
  });

  it('says nothing when the decision belongs to the dossier being decided', () => {
    // The change-of-mind path: the guardian is reopening their own in-force
    // answer, so telling them they "avaient" decided and that the question comes
    // back every year would describe a re-ask that is not happening.
    expect(priorYearDecision(lastYear, '2025-2026')).toBeNull();
  });

  it('says nothing when no decision was ever taken', () => {
    expect(priorYearDecision(null, '2026-2027')).toBeNull();
    expect(priorYearDecision(undefined, '2026-2027')).toBeNull();
  });

  it('recalls a decision for a talent with no dossier year stamped', () => {
    // A guardian whose child never opened a dossier cannot be mid-year on one, so
    // whatever they last decided is necessarily a previous answer.
    expect(priorYearDecision(lastYear, null)).toEqual(lastYear);
  });
});
