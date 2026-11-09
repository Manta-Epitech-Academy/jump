import { describe, it, expect } from 'vitest';
import { parcoursLabel } from './visitHistory';

/**
 * The parcours is the line a recruiter reads to know who they are about to
 * meet (#491). What must hold: no earlier visit reads as a first time, any
 * other count reads as visits, and both agree with the civilité, with the
 * neutral form wherever the talent did not choose « Homme » or « Femme ».
 */
describe('parcoursLabel', () => {
  it('calls a talent with no earlier visit new, agreed with the civilité', () => {
    expect(parcoursLabel(0, 'homme')).toBe('Nouveau');
    expect(parcoursLabel(0, 'femme')).toBe('Nouvelle');
    expect(parcoursLabel(0, 'autre')).toBe('Nouveau·elle');
    expect(parcoursLabel(0, null)).toBe('Nouveau·elle');
  });

  it('counts the earlier visits, agreed with the civilité', () => {
    expect(parcoursLabel(3, 'homme')).toBe('Déjà venu 3 fois');
    expect(parcoursLabel(1, 'femme')).toBe('Déjà venue 1 fois');
    expect(parcoursLabel(2, null)).toBe('Déjà venu·e 2 fois');
  });
});
