import { describe, expect, it } from 'vitest';
import { countFilterSuffix, countNounForm } from './countLabel';

describe('countNounForm', () => {
  it('keeps the singular for zero and one', () => {
    expect(countNounForm(0, 'talent')).toBe('talent');
    expect(countNounForm(1, 'talent')).toBe('talent');
  });

  it('adds an s past one', () => {
    expect(countNounForm(2, 'talent')).toBe('talents');
  });

  it('takes an irregular plural from the caller', () => {
    expect(countNounForm(3, 'stagiaire', 'stagiaires')).toBe('stagiaires');
    expect(countNounForm(1, 'stagiaire', 'stagiaires')).toBe('stagiaire');
  });
});

describe('countFilterSuffix', () => {
  it('says nothing for a list with nothing to filter', () => {
    expect(countFilterSuffix(12, undefined)).toBeUndefined();
  });

  it('reports the whole population when no filter narrows it', () => {
    expect(countFilterSuffix(124, false)).toBe('au total');
    expect(countFilterSuffix(1, false)).toBe('au total');
  });

  it('agrees in number with a filtered result', () => {
    expect(countFilterSuffix(12, true)).toBe('correspondent aux filtres');
    // The regression this function exists for: the émargement roster read
    // "1 participant correspondent aux filtres".
    expect(countFilterSuffix(1, true)).toBe('correspond aux filtres');
    expect(countFilterSuffix(0, true)).toBe('correspond aux filtres');
  });
});
