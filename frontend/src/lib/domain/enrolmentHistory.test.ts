import { describe, it, expect } from 'vitest';
import {
  PARCOURS_BUCKETS,
  parcoursBucket,
  parcoursLabel,
} from './enrolmentHistory';

/**
 * The parcours sorts a roster into newcomers and returning talents, which is
 * the split recruitment works from. What must hold: zero is a newcomer and
 * nothing else is, the tail folds into one bucket instead of growing a filter
 * value per count, and the wording never guesses a gender it does not know.
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

  it('agrees with the civilité, inclusive when it is not known', () => {
    expect(parcoursLabel(0, 'femme')).toBe('Nouvelle');
    expect(parcoursLabel(0, 'homme')).toBe('Nouveau');
    expect(parcoursLabel(0, 'autre')).toBe('Nouveau·elle');
    expect(parcoursLabel(0, null)).toBe('Nouveau·elle');
    expect(parcoursLabel(3, 'femme')).toBe('Déjà inscrite 3 fois');
    expect(parcoursLabel(1, 'homme')).toBe('Déjà inscrit 1 fois');
    expect(parcoursLabel(2, null)).toBe('Déjà inscrit·e 2 fois');
  });
});
