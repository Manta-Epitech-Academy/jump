import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import type { WorkerTalent } from '$lib/validation/workerSync';
import { assertTestDatabase } from './testDatabase';

/**
 * A login the sync cannot create or move is one talent's problem, never the
 * run's. A throw out of `syncTalents` answers the worker an error, the run
 * closes in error, and the next tick replays the same page onto the same
 * talent forever: `autoResolveAuthIdentity` once threw that way, outside any
 * `try`. So a failure that is no address conflict becomes a `LOGIN_FAILURE`
 * carrying its technical cause, and the rest of the page is still synced.
 *
 * Nothing in a test database fails on its own, so the two calls are made to
 * throw; everything else, conflicts included, is the real code.
 */

vi.mock('$lib/server/services/talentAccount', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('$lib/server/services/talentAccount')
  >()),
  ensureTalentUser: vi.fn(async () => {
    throw new Error('Timed out fetching a new connection from the pool.');
  }),
}));

vi.mock(
  '$lib/server/services/authIdentityRepairService',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('$lib/server/services/authIdentityRepairService')
    >()),
    autoResolveAuthIdentity: vi.fn(async () => {
      throw new Error('deadlock detected');
    }),
  }),
);

const { syncTalents } = await import('$lib/server/services/syncService');

describe('a login failure never fails the sync (integration)', () => {
  const stamp = Date.now();
  const mail = (name: string) => `${name}-${stamp}@loginfailure.test`;
  const externalIds: string[] = [];
  const userIds: string[] = [];

  const contact = (name: string, email: string): WorkerTalent => {
    const external_id = `lf-${name}-${stamp}`;
    externalIds.push(external_id);
    return {
      external_id,
      first_name: name,
      last_name: 'Échec',
      email,
    };
  };

  const errorOf = async (externalId: string) =>
    (
      await prisma.talent.findUniqueOrThrow({
        where: { externalId },
        select: { syncError: { select: { kind: true, detail: true } } },
      })
    ).syncError;

  beforeAll(() => {
    assertTestDatabase();
  });

  afterAll(async () => {
    // Their errors go with them (cascade).
    await prisma.talent.deleteMany({
      where: { externalId: { in: externalIds } },
    });
    await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('records a login it could not create, and syncs the rest of the page', async () => {
    const first = contact('Anne', mail('anne'));
    const second = contact('Basile', mail('basile'));

    const result = await syncTalents([first, second]);

    expect(result.created).toBe(2);
    for (const { external_id } of [first, second])
      expect(await errorOf(external_id)).toEqual({
        kind: 'LOGIN_FAILURE',
        detail: 'Timed out fetching a new connection from the pool.',
      });
  });

  it('records a repair that failed on an address an account holds', async () => {
    // The talent logs in on an old address, Salesforce now gives it one that
    // an account nobody is linked to already holds: the rename collides, and
    // the automatic repair the sync tries next is the call that throws.
    const holder = await prisma.bauth_user.create({
      data: { email: mail('claire-new'), role: 'student' },
    });
    const login = await prisma.bauth_user.create({
      data: { email: mail('claire-old'), role: 'student' },
    });
    userIds.push(holder.id, login.id);
    const claire = contact('Claire', mail('claire-new'));
    await prisma.talent.create({
      data: {
        externalId: claire.external_id,
        prenom: 'Claire',
        nom: 'Échec',
        userId: login.id,
      },
    });

    await syncTalents([claire]);

    expect(await errorOf(claire.external_id)).toEqual({
      kind: 'LOGIN_FAILURE',
      detail: 'deadlock detected',
    });
  });
});
