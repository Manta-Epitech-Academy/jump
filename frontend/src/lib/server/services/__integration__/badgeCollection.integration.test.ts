import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '#lib/server/db.ts';
import { dateKeyToDbDate } from '#lib/domain/eventPresence.ts';
import { loadBadgeCollection } from '#lib/server/talent/badgeCollection.ts';
import { assertTestDatabase } from './testDatabase';

/**
 * A talent's Epidex read off a real database (#551): every live badge, earned
 * or not, and an archived one only for the talent who earned it, in the PO's
 * order; each with the month it was earned, on the talent's calendar, and the
 * duck's lines live that day for the state it is in for them.
 */
describe('loadBadgeCollection', () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const key = (name: string) => `col-${name}-${stamp}`;
  const ART = '<circle cx="40" cy="40" r="36" fill="#013afb"></circle>';
  let talentId = '';

  async function badge(
    name: string,
    group: string,
    { archived = false }: { archived?: boolean } = {},
  ) {
    await prisma.badge_Definition.create({
      data: {
        key: key(name),
        label: `${name} ${stamp}`,
        condition: `Condition ${name}`,
        groupKey: group,
        art: ART,
        counterKey: 'xp',
        threshold: 1,
        archivedAt: archived ? new Date('2026-10-01T00:00:00Z') : null,
      },
    });
  }

  beforeAll(async () => {
    assertTestDatabase();
    talentId = (
      await prisma.talent.create({ data: { prenom: 'Léa', nom: 'Epidex' } })
    ).id;
    // Created in an order the groups reorder: a wtf one first.
    await badge('streak', 'wtf');
    await badge('held', 'parcours');
    await badge('open', 'succes');
    await badge('kept', 'succes', { archived: true });
    await badge('gone', 'succes', { archived: true });
    await prisma.badge_Award.createMany({
      data: [
        // 31 March at 22:30 UTC is already 1 April in Paris: the month the
        // talent lived it in, not the server's.
        {
          talentId,
          badgeKey: key('held'),
          awardedAt: new Date('2026-03-31T22:30:00Z'),
        },
        {
          talentId,
          badgeKey: key('kept'),
          awardedAt: new Date('2026-09-10T10:00:00Z'),
        },
      ],
    });
    const line = (
      name: string,
      momentKey: string,
      text: string,
      more: { startsOn?: string; archived?: boolean } = {},
    ) => ({
      momentKey,
      badgeKey: key(name),
      text: `${text} ${stamp}`,
      startsOn: more.startsOn ? dateKeyToDbDate(more.startsOn) : null,
      archivedAt: more.archived ? new Date() : null,
    });
    await prisma.mascot_Line.createMany({
      data: [
        line('held', 'badgeEarned', 'Bravo'),
        line('held', 'badgeToEarn', 'Pas pour toi'),
        line('held', 'badgeEarned', 'Plus tard', { startsOn: '2026-12-01' }),
        line('held', 'badgeEarned', 'Archivée', { archived: true }),
        line('open', 'badgeToEarn', 'Vas-y'),
      ],
    });
  });

  afterAll(async () => {
    try {
      const keys = ['streak', 'held', 'open', 'kept', 'gone'].map(key);
      await prisma.badge_Award.deleteMany({ where: { talentId } });
      await prisma.badge_Definition.deleteMany({
        where: { key: { in: keys } },
      });
      await prisma.talent.delete({ where: { id: talentId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  async function mine() {
    const collection = await loadBadgeCollection(
      talentId,
      '2026-11-26',
      'Europe/Paris',
    );
    return collection.badges.filter((b) => b.key.endsWith(stamp));
  }

  it('shows every live badge and the archived ones this talent earned, by group', async () => {
    expect((await mine()).map((b) => b.key)).toEqual(
      [`held`, `open`, `kept`, `streak`].map(key),
    );
  });

  it('dates an earned badge in the talent calendar, and leaves the others undated', async () => {
    const byKey = new Map((await mine()).map((b) => [b.key, b]));
    expect(byKey.get(key('held'))?.earnedOn).toBe('avril 2026');
    expect(byKey.get(key('kept'))?.earnedOn).toBe('septembre 2026');
    expect(byKey.get(key('open'))?.earnedOn).toBeNull();
  });

  it("carries only the duck's lines live today, for the state the badge is in", async () => {
    const byKey = new Map((await mine()).map((b) => [b.key, b]));
    expect(byKey.get(key('held'))?.lines).toEqual([`Bravo ${stamp}`]);
    expect(byKey.get(key('open'))?.lines).toEqual([`Vas-y ${stamp}`]);
    expect(byKey.get(key('streak'))).toMatchObject({
      lines: [],
      condition: 'Condition streak',
    });
  });
});
