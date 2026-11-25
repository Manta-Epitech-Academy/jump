import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { prisma } from '#lib/server/db.ts';
import { grantXp } from '#lib/server/services/xpService.ts';
import {
  loadPendingCelebrations,
  markCelebrationsPlayed,
} from '#lib/server/talent/celebrations.ts';
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
  /** A load with no arrival cookie: only the ledger decides. */
  const noCookies = {
    get: () => undefined,
    delete: () => {},
  } as unknown as Cookies;

  beforeAll(() => assertTestDatabase());

  afterAll(async () => {
    try {
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
    expect(await pending(id)).toBeNull();

    await give(id, 200);
    const owed = await pending(id);
    // An admin's grant has no celebration of its own: the level is revealed
    // alone, with no amount and no bar.
    expect(owed?.items).toEqual([
      { kind: 'level', level: 'Maker', tone: 'together' },
    ]);
    expect(owed?.ack).toEqual({ minigame: [], levelUpTo: 2600 });

    await markCelebrationsPlayed(id, owed!.ack);
    expect(await pending(id)).toBeNull();

    // XP taken back and earned again: Maker was already celebrated.
    await give(id, -300);
    await give(id, 300);
    expect(await pending(id)).toBeNull();
  });

  it('never lowers the mark for a stale tab acknowledging less', async () => {
    const id = await nearlyMaker();
    await give(id, 200);
    await markCelebrationsPlayed(id, { minigame: [], levelUpTo: 2600 });
    await markCelebrationsPlayed(id, { minigame: [], levelUpTo: 100 });
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
    await ackCelebrations(owed!.ack);
    expect((await row(id)).levelCelebratedXp).toBe(2400);
    expect(await pending(id)).not.toBeNull();

    callAs({ talent });
    await ackCelebrations(owed!.ack);
    expect((await row(id)).levelCelebratedXp).toBe(2600);
  });
});
