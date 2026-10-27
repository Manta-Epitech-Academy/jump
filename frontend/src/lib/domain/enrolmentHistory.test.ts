import { describe, it, expect } from 'vitest';
import {
  PARCOURS_BUCKETS,
  PARCOURS_BUCKET_LABELS,
  parcoursBucket,
  parcoursLabel,
} from './enrolmentHistory';

/**
 * The parcours sorts a roster into newcomers and returning talents, which is
 * the split recruitment works from. What must hold: zero is a newcomer and
 * nothing else is, the tail folds into one bucket instead of growing a filter
 * value per count, and a cell and the filter value it falls under say the same
 * rank.
 */
describe('parcours', () => {
  it('calls only a talent with no past enrolment a newcomer', () => {
    expect(parcoursBucket(0)).toBe('nouveau');
    expect(parcoursBucket(1)).toBe('1');
    expect(parcoursBucket(2)).toBe('2');
  });

  it('folds three past enrolments and more into one bucket', () => {
    expect(parcoursBucket(3)).toBe('3-et-plus');
    expect(parcoursBucket(12)).toBe('3-et-plus');
    expect(PARCOURS_BUCKETS).toHaveLength(4);
  });

  it('names the rank of this enrolment, as its filter value does', () => {
    expect(parcoursLabel(0)).toBe('1ʳᵉ inscription');
    expect(parcoursLabel(2)).toBe('3ᵉ inscription');
    expect(parcoursLabel(7)).toBe('8ᵉ inscription');
    for (const prior of [0, 1, 2])
      expect(parcoursLabel(prior)).toBe(
        PARCOURS_BUCKET_LABELS[parcoursBucket(prior)],
      );
  });
});
