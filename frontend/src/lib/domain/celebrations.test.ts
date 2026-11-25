import { describe, it, expect } from 'vitest';
import { ackOf, stageCelebrations, xpGains } from './celebrations';

/**
 * What the duck's stage plays (#540): an amount fills the level bar it moved,
 * the amount that crosses into a level reveals it and carries its mark, and a
 * level nobody celebrated an amount for is revealed alone. Explorer runs from
 * 0 to 2500, Maker from 2500 to 10000.
 */
describe('stageCelebrations', () => {
  const activity = (xp: number) =>
    xpGains.activity(xp, [{ activityId: 'a1', amount: xp }]);

  it('fills the bar of the level an amount stays in', () => {
    const items = stageCelebrations([activity(500)], {
      xp: 1500,
      levelCelebratedXp: 1000,
    });
    expect(items).toEqual([
      {
        kind: 'xp',
        moment: 'activityXp',
        xp: 500,
        key: 'activity:a1=500',
        ack: { workshopUpTo: [{ activityId: 'a1', amount: 500 }] },
        bar: { level: 'Explorer', next: 'Maker', from: 0.4, to: 0.6 },
        reached: null,
      },
    ]);
  });

  it('reveals the level from the amount that crossed into it, with its mark', () => {
    const items = stageCelebrations(
      [activity(300), xpGains.daily('pub-1', 100)],
      { xp: 2550, levelCelebratedXp: 2000 },
    );
    expect(items).toEqual([
      expect.objectContaining({
        moment: 'activityXp',
        bar: { level: 'Explorer', next: 'Maker', from: 0.86, to: 0.98 },
        reached: null,
        ack: { workshopUpTo: [{ activityId: 'a1', amount: 300 }] },
      }),
      expect.objectContaining({
        moment: 'dailyGameXp',
        key: 'daily:pub-1',
        bar: { level: 'Explorer', next: 'Maker', from: 0.98, to: 1 },
        reached: { level: 'Maker', tone: 'together' },
        ack: { daily: 'pub-1', levelUpTo: 2550 },
      }),
    ]);
  });

  it('reveals alone a level no celebrated amount crossed into', () => {
    const items = stageCelebrations([xpGains.daily('pub-1', 100)], {
      xp: 2800,
      levelCelebratedXp: 2000,
    });
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
        ack: { daily: 'pub-1' },
      }),
      {
        kind: 'level',
        level: 'Maker',
        tone: 'together',
        key: 'level:Maker',
        ack: { levelUpTo: 2800 },
      },
    ]);
  });

  it('never reveals again a level already celebrated', () => {
    const items = stageCelebrations([activity(400)], {
      xp: 2700,
      levelCelebratedXp: 2600,
    });
    expect(items[0]).toMatchObject({
      reached: null,
      bar: { level: 'Maker', from: 0 },
    });
    expect(ackOf(items).levelUpTo).toBeUndefined();
  });
});

describe('ackOf', () => {
  // A page acknowledges what it queued and nothing else: an item it left out
  // (one it already showed) must not lend its mark to the batch.
  it('marks exactly the items given', () => {
    const items = stageCelebrations(
      [
        xpGains.activity(100, [{ activityId: 'a1', amount: 100 }]),
        xpGains.rank('pub-2', 50),
      ],
      // The rank bonus crosses into Maker, so it carries the level's mark.
      { xp: 2520, levelCelebratedXp: 2000 },
    );
    expect(ackOf(items)).toEqual({
      workshopUpTo: [{ activityId: 'a1', amount: 100 }],
      rank: 'pub-2',
      levelUpTo: 2520,
    });
    expect(ackOf(items.slice(0, 1))).toEqual({
      workshopUpTo: [{ activityId: 'a1', amount: 100 }],
    });
  });
});
