import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { prisma } from '#lib/server/db.ts';
import { grantXp } from '#lib/server/services/xpService.ts';
import {
  loadPendingCelebrations,
  markCelebrationsPlayed,
} from '#lib/server/talent/celebrations.ts';
import { ackOf } from '#lib/domain/celebrations.ts';
import { callAs } from '#lib/testing/kitRemote.ts';
import { assertTestDatabase } from './testDatabase';

vi.mock('$app/server', () => import('#lib/testing/kitRemote.ts'));

/**
 * The level scene the duck plays (#540), held to its two promises: a level is
 * celebrated once, whatever moves the XP afterwards, and an admin looking
 * through the talent's session marks nothing played, so the talent still gets
 * it on their own next visit.
 */
describe('the level celebration (integration)', () => {
  const stamp = Date.now();
  const talentIds: string[] = [];
  const publicationIds: string[] = [];
  /** A load with no arrival cookie: only the ledger decides. */
  const noCookies = {
    get: () => undefined,
    delete: () => {},
  } as unknown as Cookies;

  beforeAll(() => assertTestDatabase());

  afterAll(async () => {
    try {
      await prisma.minigameAttempt.deleteMany({
        where: { talentId: { in: talentIds } },
      });
      await prisma.minigamePublication.deleteMany({
        where: { id: { in: publicationIds } },
      });
      await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
    } catch {
      // ignore: the test database is disposable
    }
  });

  /** A talent just short of Maker, their level celebrated where it stands. */
  async function nearlyMaker() {
    const talent = await prisma.talent.create({
      data: {
        prenom: 'Lina',
        nom: `Niveau ${stamp}-${talentIds.length}`,
        niveau: '4eme',
        welcomeSeenAt: new Date(),
        charterAcceptedAt: new Date(),
      },
    });
    talentIds.push(talent.id);
    await give(talent.id, 2400);
    await prisma.talent.update({
      where: { id: talent.id },
      data: { levelCelebratedXp: 2400 },
    });
    return talent.id;
  }

  const give = (talentId: string, amount: number) =>
    prisma.$transaction((tx) =>
      grantXp(tx, {
        talentId,
        source: 'admin_adjustment',
        sourceId: null,
        amount,
      }),
    );
  const row = (id: string) =>
    prisma.talent.findUniqueOrThrow({ where: { id } });
  const pending = async (id: string) =>
    loadPendingCelebrations(await row(id), noCookies);

  it('celebrates a level reached once, and never again', async () => {
    const id = await nearlyMaker();
    expect(await pending(id)).toEqual([]);

    await give(id, 200);
    const owed = await pending(id);
    // An admin's grant has no celebration of its own: the level is revealed
    // alone, with no amount and no bar.
    expect(owed).toEqual([
      {
        kind: 'level',
        level: 'Maker',
        tone: 'together',
        key: 'level:Maker',
        ack: { levelUpTo: 2600 },
      },
    ]);

    await markCelebrationsPlayed(id, ackOf(owed));
    expect(await pending(id)).toEqual([]);

    // XP taken back and earned again: Maker was already celebrated.
    await give(id, -300);
    await give(id, 300);
    expect(await pending(id)).toEqual([]);
  });

  it('never lowers the mark for a stale tab acknowledging less', async () => {
    const id = await nearlyMaker();
    await give(id, 200);
    await markCelebrationsPlayed(id, { levelUpTo: 2600 });
    await markCelebrationsPlayed(id, { levelUpTo: 100 });
    expect((await row(id)).levelCelebratedXp).toBe(2600);
  });

  it('marks nothing played when an admin looks through the session', async () => {
    const { ackCelebrations } =
      await import('#lib/components/mascot/celebrations.remote.ts');
    const id = await nearlyMaker();
    await give(id, 200);
    const owed = await pending(id);
    const talent = (await row(id)) as unknown as App.Locals['talent'];

    callAs({ talent, session: { impersonatedBy: 'admin-1' } as never });
    await ackCelebrations(ackOf(owed));
    expect((await row(id)).levelCelebratedXp).toBe(2400);
    expect(await pending(id)).not.toEqual([]);

    callAs({ talent });
    await ackCelebrations(ackOf(owed));
    expect((await row(id)).levelCelebratedXp).toBe(2600);
  });
  /** A challenge the talent finished at `finishedAt`, its XP granted. */
  async function won(
    talentId: string,
    finishedAt: Date,
    { xp, rankXp }: { xp: number; rankXp?: number },
  ) {
    const publication = await prisma.minigamePublication.create({
      data: {
        game: 'board',
        gameName: 'Board',
        level: 1,
        scoringType: 'score',
      },
    });
    publicationIds.push(publication.id);
    await prisma.minigameAttempt.create({
      data: {
        talentId,
        publicationId: publication.id,
        status: 'done',
        valid: true,
        score: 10,
        jti: randomUUID(),
        finishedAt,
        xpAwarded: xp,
        rankXpAwarded: rankXp ?? null,
      },
    });
    await give(talentId, xp + (rankXp ?? 0));
    return publication.id;
  }

  it('plays a challenge before its rank bonus, and marks only what it showed', async () => {
    const id = await nearlyMaker();
    const shown = await won(id, new Date(Date.now() - 60_000), {
      xp: 50,
      rankXp: 100,
    });
    const owed = await pending(id);
    // Granted in that order, so counted back from the total in that order:
    // the rank bonus is the amount that crosses into Maker, and it carries
    // the level's mark.
    expect(owed).toEqual([
      expect.objectContaining({
        moment: 'dailyGameXp',
        reached: null,
        ack: { daily: shown },
      }),
      expect.objectContaining({
        moment: 'rankXp',
        reached: { level: 'Maker', tone: 'together' },
        ack: { rank: shown, levelUpTo: 2550 },
      }),
    ]);

    // Another challenge finished while the stage played: what was on screen
    // is marked, not everything, so the later win is still owed.
    const later = await won(id, new Date(), { xp: 50 });
    await markCelebrationsPlayed(id, ackOf(owed));
    expect(await pending(id)).toEqual([
      expect.objectContaining({
        moment: 'dailyGameXp',
        ack: { daily: later },
      }),
    ]);
  });
});
