import { describe, it, expect } from 'vitest';
import { stageCelebrations } from './celebrations';

/**
 * What the duck's stage plays (#540): an amount fills the level bar it moved,
 * the amount that crosses into a level reveals it, and a level nobody
 * celebrated an amount for is revealed alone. Explorer runs from 0 to 2500,
 * Maker from 2500 to 10000.
 */
describe('stageCelebrations', () => {
  it('fills the bar of the level an amount stays in', () => {
    const { items, levelUpTo } = stageCelebrations(
      [{ moment: 'activityXp', xp: 500 }],
      { xp: 1500, levelCelebratedXp: 1000 },
    );
    expect(items).toEqual([
      {
        kind: 'xp',
        moment: 'activityXp',
        xp: 500,
        bar: { level: 'Explorer', next: 'Maker', from: 0.4, to: 0.6 },
        reached: null,
      },
    ]);
    expect(levelUpTo).toBeUndefined();
  });

  it('reveals the level from the amount that crossed into it', () => {
    const { items, levelUpTo } = stageCelebrations(
      [
        { moment: 'activityXp', xp: 300 },
        { moment: 'dailyGameXp', xp: 100 },
      ],
      { xp: 2550, levelCelebratedXp: 2000 },
    );
    expect(items).toEqual([
      {
        kind: 'xp',
        moment: 'activityXp',
        xp: 300,
        bar: { level: 'Explorer', next: 'Maker', from: 0.86, to: 0.98 },
        reached: null,
      },
      {
        kind: 'xp',
        moment: 'dailyGameXp',
        xp: 100,
        bar: { level: 'Explorer', next: 'Maker', from: 0.98, to: 1 },
        reached: { level: 'Maker', tone: 'together' },
      },
    ]);
    expect(levelUpTo).toBe(2550);
  });

  it('reveals alone a level no celebrated amount crossed into', () => {
    const { items, levelUpTo } = stageCelebrations(
      [{ moment: 'dailyGameXp', xp: 100 }],
      { xp: 2800, levelCelebratedXp: 2000 },
    );
    // XP from elsewhere (an admin's grant) took the talent past Maker: the
    // challenge's 100 XP only moved them along in it.
    expect(items).toEqual([
      expect.objectContaining({
        moment: 'dailyGameXp',
        bar: {
          level: 'Maker',
          next: 'Hacker',
          from: expect.closeTo(200 / 7500),
          to: expect.closeTo(300 / 7500),
        },
        reached: null,
      }),
      { kind: 'level', level: 'Maker', tone: 'together' },
    ]);
    expect(levelUpTo).toBe(2800);
  });

  it('never reveals again a level already celebrated', () => {
    const { items, levelUpTo } = stageCelebrations(
      [{ moment: 'activityXp', xp: 400 }],
      { xp: 2700, levelCelebratedXp: 2600 },
    );
    expect(items[0]).toMatchObject({
      reached: null,
      bar: { level: 'Maker', from: 0 },
    });
    expect(levelUpTo).toBeUndefined();
  });
});
