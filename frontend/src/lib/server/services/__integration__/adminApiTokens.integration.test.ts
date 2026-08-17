import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import {
  mintToken,
  verifyToken,
  revokeToken,
  listTokens,
  hashSecret,
  DAILY_CALL_QUOTA,
} from '$lib/server/adminApi/tokens';
import {
  authenticateAdminApi,
  authorizeOperation,
} from '$lib/server/adminApi/guard';
import { ADMIN_API_OPERATIONS } from '$lib/server/adminApi/operations';
import {
  recordAdminApiCall,
  purgeAdminApiCalls,
  ANONYMOUS_ACTOR,
} from '$lib/server/adminApi/audit';

/** Any core read; the quota rules do not depend on which one. */
const READ_OPERATION = ADMIN_API_OPERATIONS.stats_sync_health;

/** A request carrying (or not) a bearer, which is all the guard reads. */
function requestWith(secret?: string) {
  return {
    request: new Request('http://localhost/api/admin/stats/sync-health', {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    }),
    locals: {} as App.Locals,
  };
}

describe('admin API tokens (integration)', () => {
  const stamp = Date.now();
  let adminUserId = '';
  let otherAdminUserId = '';
  /** Kept apart: demoting an owner would cut the tokens the other tests use. */
  let demotedUserId = '';

  const admin = (slug: string) =>
    createAdminAccount(`token.${slug}.${stamp}@epitech.eu`);

  beforeAll(async () => {
    assertTestDatabase();
    const [owner, other, demoted] = await Promise.all([
      admin('admin'),
      admin('other'),
      admin('demoted'),
    ]);
    adminUserId = owner.id;
    otherAdminUserId = other.id;
    demotedUserId = demoted.id;
  });

  afterAll(async () => {
    try {
      const ids = [adminUserId, otherAdminUserId, demotedUserId];
      // Tokens and staff profiles cascade with the account; call rows keep
      // `actorUserId` but drop their FK, so clear them explicitly.
      await prisma.adminApi_Call.deleteMany({
        where: { actorUserId: { in: ids } },
      });
      await prisma.bauth_user.deleteMany({ where: { id: { in: ids } } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('stores only a hash, and the secret verifies exactly once it exists', async () => {
    const minted = await mintToken(adminUserId, { label: '  Client IA  ' });

    expect(minted.secret.startsWith('jump_')).toBe(true);
    expect(minted.label).toBe('Client IA'); // trimmed

    const row = await prisma.adminApi_Token.findUnique({
      where: { id: minted.id },
    });
    // The plaintext must exist nowhere in the row.
    expect(row?.tokenHash).toBe(hashSecret(minted.secret));
    expect(JSON.stringify(row)).not.toContain(minted.secret);
    expect(row?.lastUsedAt).toBeNull();

    const verified = await verifyToken(minted.secret);
    expect(verified).toEqual({
      tokenId: minted.id,
      staffUserId: adminUserId,
      // Capabilities travel with the verified token, so the guard settles tier
      // and write access without a second lookup.
      tier: 'core',
      writeEnabled: false,
    });
    // Verifying stamps usage, so an unused token is visible as such.
    expect(
      (await prisma.adminApi_Token.findUnique({ where: { id: minted.id } }))
        ?.lastUsedAt,
    ).not.toBeNull();
  });

  it('rejects a revoked token and a garbage one, and lets any admin cut any token', async () => {
    const minted = await mintToken(adminUserId, { label: 'À révoquer' });

    // Cut by an admin who does not own it. That is the point of the shared
    // inventory: a leadership token's holder has no Jump account, so waiting for
    // its issuer to be reachable is not a revocation path.
    expect(await revokeToken(minted.id, otherAdminUserId)).toEqual({
      ok: true,
    });

    // Unknown and revoked look identical from outside, so nobody can probe which.
    expect(await verifyToken(minted.secret)).toBeNull();
    expect(await verifyToken('jump_not-a-real-token')).toBeNull();
    expect(await verifyToken('not-even-prefixed')).toBeNull();

    const row = await prisma.adminApi_Token.findUnique({
      where: { id: minted.id },
    });
    // Revocation is a timestamp, not a delete: the trail survives, and it names
    // who cut it rather than only who owned it.
    expect(row?.revokedAt).not.toBeNull();
    expect(row?.revokedByUserId).toBe(otherAdminUserId);

    // Re-revoking is a no-op rather than an error.
    expect(await revokeToken(minted.id, adminUserId)).toEqual({ ok: false });
  });

  it('stops resolving a token once its owner is no longer an admin', async () => {
    const minted = await mintToken(demotedUserId, { label: 'Rétrogradé' });
    expect(await verifyToken(minted.secret)).not.toBeNull();
    const usedAt = (
      await prisma.adminApi_Token.findUnique({ where: { id: minted.id } })
    )?.lastUsedAt;

    // What `/staff/admin/users` does when somebody moves to the dev team. It has
    // no business knowing this table exists, so the credential is what asks.
    await prisma.staffProfile.update({
      where: { userId: demotedUserId },
      data: { staffRole: 'dev' },
    });

    expect(await verifyToken(minted.secret)).toBeNull();

    const row = await prisma.adminApi_Token.findUnique({
      where: { id: minted.id },
    });
    // Nothing was revoked: the authority behind the token went away, which is a
    // different fact and stays visible as one in the list.
    expect(row?.revokedAt).toBeNull();
    // And a token that no longer resolves was not used, it was presented.
    expect(row?.lastUsedAt).toEqual(usedAt);
  });

  it('answers 401 for a bad bearer and 403 for no credentials at all, logging both', async () => {
    const bad = await authenticateAdminApi(requestWith('jump_nope'));
    expect(bad).toMatchObject({ ok: false, status: 401 });

    const none = await authenticateAdminApi(requestWith());
    expect(none).toMatchObject({ ok: false, status: 403 });
    expect(none.caller.actorUserId).toBe(ANONYMOUS_ACTOR);

    // A refused call is exactly the kind worth having in the log.
    await recordAdminApiCall({
      caller: none.caller,
      operation: 'stats_sync_health',
      status: 403,
    });
    expect(
      await prisma.adminApi_Call.count({
        where: { actorUserId: ANONYMOUS_ACTOR, status: 403 },
      }),
    ).toBeGreaterThan(0);
    await prisma.adminApi_Call.deleteMany({
      where: { actorUserId: ANONYMOUS_ACTOR },
    });
  });

  it('lets a live token through and cuts it off at the daily quota', async () => {
    const minted = await mintToken(adminUserId, { label: 'Quota' });

    const credential = await authenticateAdminApi(requestWith(minted.secret));
    expect(credential).toMatchObject({ ok: true });
    if (!credential.ok) throw new Error('unreachable');
    expect(await authorizeOperation(credential, READ_OPERATION)).toEqual({
      ok: true,
    });

    // Fill the window. Rows are the counter, so there is no separate state to
    // fake here.
    await prisma.adminApi_Call.createMany({
      data: Array.from({ length: DAILY_CALL_QUOTA }, () => ({
        tokenId: minted.id,
        actorUserId: adminUserId,
        operation: 'stats_sync_health',
        status: 200,
      })),
    });

    expect(await authorizeOperation(credential, READ_OPERATION)).toMatchObject({
      ok: false,
      status: 429,
    });

    // A call older than the window does not count against it.
    await prisma.adminApi_Call.deleteMany({ where: { tokenId: minted.id } });
    await prisma.adminApi_Call.create({
      data: {
        tokenId: minted.id,
        actorUserId: adminUserId,
        operation: 'stats_sync_health',
        status: 200,
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    });
    expect(await authorizeOperation(credential, READ_OPERATION)).toEqual({
      ok: true,
    });
  });

  it('lists every admin token with its owner and recent usage, newest first', async () => {
    const tokens = await listTokens();
    const mine = tokens.filter((token) => token.owner.id === adminUserId);

    expect(mine.length).toBeGreaterThanOrEqual(3);
    expect(tokens[0].createdAt.getTime()).toBeGreaterThanOrEqual(
      tokens[tokens.length - 1].createdAt.getTime(),
    );
    // Another admin's token is in the same list, or nobody could cut it.
    expect(tokens.some((token) => token.owner.id === demotedUserId)).toBe(true);
    // These accounts carry no display name, so the owner falls back to the email
    // rather than to an empty label nobody can act on.
    expect(mine[0].owner.name).toContain('@epitech.eu');
    // The 48h-old row above is outside the window, so it is not counted.
    expect(mine.find((token) => token.label === 'Quota')?.callsToday).toBe(0);
    // Revoked tokens stay listed: the trail is what an incident is read from.
    expect(mine.some((token) => token.revokedAt !== null)).toBe(true);
    // No token list ever carries a usable secret.
    expect(JSON.stringify(tokens)).not.toContain('jump_');
  });

  it('purges call rows past the retention window and keeps recent ones', async () => {
    const minted = await mintToken(adminUserId, { label: 'Retention' });
    await prisma.adminApi_Call.createMany({
      data: [
        {
          tokenId: minted.id,
          actorUserId: adminUserId,
          operation: 'stats_sync_health',
          status: 200,
          createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
        },
        {
          tokenId: minted.id,
          actorUserId: adminUserId,
          operation: 'stats_sync_health',
          status: 200,
        },
      ],
    });

    const { deleted } = await purgeAdminApiCalls(180);
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.adminApi_Call.count({ where: { tokenId: minted.id } }),
    ).toBe(1);
  });
});
