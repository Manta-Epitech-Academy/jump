import { describe, expect, it } from 'vitest';
import { advanceNiveau, isNiveau, compareNiveaux, niveauLabel } from './niveau';

describe('niveau domain helpers', () => {
  it('advanceNiveau advances school levels by 1 step', () => {
    expect(advanceNiveau('6eme')).toBe('5eme');
    expect(advanceNiveau('5eme')).toBe('4eme');
    expect(advanceNiveau('4eme')).toBe('3eme');
    expect(advanceNiveau('3eme')).toBe('2nde');
    expect(advanceNiveau('2nde')).toBe('1ere');
    expect(advanceNiveau('1ere')).toBe('terminale');
    expect(advanceNiveau('terminale')).toBe('bac_1');
    expect(advanceNiveau('bac_1')).toBe('bac_2');
    expect(advanceNiveau('bac_2')).toBe('bac_3');
    expect(advanceNiveau('bac_3')).toBe('bac_4');
    expect(advanceNiveau('bac_4')).toBe('bac_5');
  });

  it('advanceNiveau leaves terminal and special levels unchanged', () => {
    expect(advanceNiveau('bac_5')).toBe('bac_5');
    expect(advanceNiveau('tech2')).toBe('tech2');
    expect(advanceNiveau('coding_academy')).toBe('coding_academy');
    expect(advanceNiveau('wac')).toBe('wac');
    expect(advanceNiveau('autre')).toBe('autre');
  });

  it('advanceNiveau handles null or undefined safely', () => {
    expect(advanceNiveau(null)).toBeNull();
    expect(advanceNiveau(undefined)).toBeNull();
    expect(advanceNiveau('')).toBeNull();
  });
});
