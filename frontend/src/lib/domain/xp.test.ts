import { describe, it, expect } from 'vitest';
import {
  JUMP_LEVELS,
  computeLevel,
  levelProgress,
  xpRangeForLevel,
} from './xp';

describe('levels', () => {
  it('places each threshold in the tier it opens', () => {
    expect([0, 199, 200, 499, 500, 10_000].map(computeLevel)).toEqual([
      'Novice',
      'Novice',
      'Apprentice',
      'Apprentice',
      'Expert',
      'Expert',
    ]);
  });

  it('keeps a negative total in the first tier', () => {
    expect(computeLevel(-50)).toBe('Novice');
    expect(levelProgress(-50).ratio).toBe(0);
  });

  it('measures the way to the next level from the start of the current one', () => {
    expect(levelProgress(300)).toMatchObject({
      level: 'Apprentice',
      min: 200,
      next: { level: 'Expert', min: 500 },
    });
    expect(levelProgress(300).ratio).toBeCloseTo(1 / 3);
  });

  it('announces no next level at the top, and a full bar', () => {
    expect(levelProgress(5_000)).toMatchObject({
      level: 'Expert',
      next: null,
      ratio: 1,
    });
  });

  // The broadcast filter and the engagement stats query by these bounds: a
  // gap or an overlap between two tiers would count a talent twice or never.
  it('gives each level the range up to the next one, open at the top', () => {
    expect(JUMP_LEVELS.map(xpRangeForLevel)).toEqual([
      { min: 0, maxExclusive: 200 },
      { min: 200, maxExclusive: 500 },
      { min: 500, maxExclusive: null },
    ]);
  });
});
