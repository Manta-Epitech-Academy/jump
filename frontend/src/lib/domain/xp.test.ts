import { describe, it, expect } from 'vitest';
import {
  JUMP_LEVELS,
  computeLevel,
  levelProgress,
  levelReachedSince,
  levelXpFilter,
  xpRangeForLevel,
} from './xp';

/**
 * A level decides what a talent reads about their progress and who a broadcast
 * filtered by level reaches. Both read the same table, so a threshold off by
 * one or a gap between two levels would show one level and target another.
 */
describe('Jump levels', () => {
  it('places each threshold in the level it opens', () => {
    expect(
      [0, 2499, 2500, 9999, 10000, 24999, 25000, 49999, 50000, 1_000_000].map(
        computeLevel,
      ),
    ).toEqual([
      'Explorer',
      'Explorer',
      'Maker',
      'Maker',
      'Hacker',
      'Hacker',
      'Builder',
      'Builder',
      'Expert',
      'Expert',
    ]);
  });

  it('keeps a negative total in the first level', () => {
    expect(computeLevel(-50)).toBe('Explorer');
    expect(levelProgress(-50).ratio).toBe(0);
  });

  // The broadcast filter and the engagement stats query by these bounds: a
  // gap or an overlap between two levels would count a talent twice or never.
  it('tiles the XP line with no gap and no overlap, open at the top', () => {
    const ranges = JUMP_LEVELS.map(xpRangeForLevel);
    expect(ranges[0].min).toBe(0);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].min).toBe(ranges[i - 1].maxExclusive);
    }
    expect(ranges.at(-1)!.maxExclusive).toBeNull();
  });

  it('filters a level on the same bounds it is computed with', () => {
    for (const level of JUMP_LEVELS) {
      const { gte, lt } = levelXpFilter(level);
      expect(computeLevel(gte)).toBe(level);
      if (lt !== undefined) expect(computeLevel(lt - 1)).toBe(level);
    }
    expect(levelXpFilter('Expert')).toEqual({ gte: 50000 });
  });

  it('tells a talent what is left before the next level', () => {
    expect(levelProgress(1250)).toEqual({
      level: 'Explorer',
      tone: 'tech',
      tagline: 'Tu découvres le code et le campus.',
      min: 0,
      next: { level: 'Maker', min: 2500, xpToGo: 1250 },
      ratio: 0.5,
    });
  });

  it('announces no next level at the top, and a full bar', () => {
    expect(levelProgress(62000)).toMatchObject({
      level: 'Expert',
      next: null,
      ratio: 1,
    });
  });
});

describe('levelReachedSince', () => {
  // The duck celebrates a level once (#540): from the total it was last
  // celebrated at, a gain inside the same level is nothing to celebrate.
  it('names the level a gain crosses into, and nothing within one level', () => {
    expect(levelReachedSince(2400, 2500)).toBe('Maker');
    expect(levelReachedSince(2500, 9999)).toBeNull();
    expect(levelReachedSince(0, 0)).toBeNull();
  });

  it('celebrates the level reached when a gain skips one', () => {
    expect(levelReachedSince(100, 12000)).toBe('Hacker');
  });

  it('celebrates nothing when XP were taken back', () => {
    expect(levelReachedSince(12000, 3000)).toBeNull();
  });
});
