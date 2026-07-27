import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import {
  mintToken,
  verifyToken,
  revokeToken,
  listTokens,
  hashSecret,
  DAILY_CALL_QUOTA,
} from '$lib/server/adminApi/tokens';
import { authenticateAdminApi } from '$lib/server/adminApi/guard';
import {
  recordAdminApiCall,
  purgeAdminApiCalls,
  ANONYMOUS_ACTOR,
} from '$lib/server/adminApi/audit';

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

  beforeAll(async () => {
    assertTestDatabase();
    const [admin, other] = await Promise.all([
      prisma.bauth_user.create({
        data: { email: `token.admin.${stamp}@epitech.eu`, role: 'admin' },
      }),
      prisma.bauth_user.create({
        data: { email: `token.other.${stamp}@epitech.eu`, role: 'admin' },
      }),
    ]);
    adminUserId = admin.id;
    otherAdminUserId = other.id;
  });

  afterAll(async () => {
    try {
      // Tokens cascade with the account; call rows keep `actorUserId` but drop
      // their FK, so clear them explicitly.
      await prisma.adminApi_Call.deleteMany({
        where: { actorUserId: { in: [adminUserId, otherAdminUserId] } },
      });
      await prisma.bauth_user.deleteMany({
        where: { id: { in: [adminUserId, otherAdminUserId] } },
      });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('stores only a hash, and the secret verifies exactly once it exists', async () => {
    const minted = await mintToken(adminUserId, '  Client IA  ');

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
    });
    // Verifying stamps usage, so an unused token is visible as such.
    expect(
      (await prisma.adminApi_Token.findUnique({ where: { id: minted.id } }))
        ?.lastUsedAt,
    ).not.toBeNull();
  });

  it('rejects a revoked token, a garbage token and a foreign revocation attempt', async () => {
    const minted = await mintToken(adminUserId, 'À révoquer');

    // Another admin cannot revoke it by id: the list is per owner.
    expect(await revokeToken(minted.id, otherAdminUserId)).toEqual({
      ok: false,
    });
    expect(await verifyToken(minted.secret)).not.toBeNull();

    expect(await revokeToken(minted.id, adminUserId)).toEqual({ ok: true });
    // Unknown and revoked look identical from outside, so nobody can probe which.
    expect(await verifyToken(minted.secret)).toBeNull();
    expect(await verifyToken('jump_not-a-real-token')).toBeNull();
    expect(await verifyToken('not-even-prefixed')).toBeNull();

    // Revocation is a timestamp, not a delete: the trail survives.
    expect(
      (await prisma.adminApi_Token.findUnique({ where: { id: minted.id } }))
        ?.revokedAt,
    ).not.toBeNull();

    // Re-revoking is a no-op rather than an error.
    expect(await revokeToken(minted.id, adminUserId)).toEqual({ ok: false });
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
    const minted = await mintToken(adminUserId, 'Quota');

    const first = await authenticateAdminApi(requestWith(minted.secret));
    expect(first).toMatchObject({ ok: true });

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

    const throttled = await authenticateAdminApi(requestWith(minted.secret));
    expect(throttled).toMatchObject({ ok: false, status: 429 });
    if (!throttled.ok) {
      expect(throttled.caller.tokenId).toBe(minted.id);
    }

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
    expect(
      await authenticateAdminApi(requestWith(minted.secret)),
    ).toMatchObject({ ok: true });
  });

  it("lists an owner's tokens with their recent usage, newest first", async () => {
    const tokens = await listTokens(adminUserId);

    expect(tokens.length).toBeGreaterThanOrEqual(3);
    expect(tokens[0].createdAt.getTime()).toBeGreaterThanOrEqual(
      tokens[tokens.length - 1].createdAt.getTime(),
    );
    // The 48h-old row above is outside the window, so it is not counted.
    expect(tokens.find((t) => t.label === 'Quota')?.callsToday).toBe(0);
    // Revoked tokens stay listed: the owner needs to see what was cut.
    expect(tokens.some((t) => t.revokedAt !== null)).toBe(true);
    // No token list ever carries a usable secret.
    expect(JSON.stringify(tokens)).not.toContain('jump_');
  });

  it('purges call rows past the retention window and keeps recent ones', async () => {
    const minted = await mintToken(adminUserId, 'Retention');
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
