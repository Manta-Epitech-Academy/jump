/**
 * The rules that decide whether a call happens at all, against a real database:
 * which tier may reach which operation, who may write, and the two quotas.
 *
 * Integration rather than unit, because every one of those answers is settled by
 * reading rows (the token, then the call log). Mocking that away would test the
 * `if`s and none of the behaviour.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { mintToken, WRITE_CALL_QUOTA } from '$lib/server/adminApi/tokens';
import {
  authenticateAdminApi,
  authorizeOperation,
  type AdminApiCredential,
} from '$lib/server/adminApi/guard';
import { ADMIN_API_OPERATIONS } from '$lib/server/adminApi/operations';

const LEADERSHIP_OPERATION = ADMIN_API_OPERATIONS.stats_cohort_profile;
const CORE_ONLY_OPERATION = ADMIN_API_OPERATIONS.ops_pdf_jobs_health;
const WRITE_OPERATION = ADMIN_API_OPERATIONS.write_event_config;

function requestWith(secret?: string) {
  return {
    request: new Request('http://localhost/api/admin/stats/cohort-profile', {
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    }),
    locals: {} as App.Locals,
  };
}

/** An admin browsing the admin space: a session, never a token. */
function sessionRequest(userId: string) {
  return {
    request: new Request('http://localhost/api/admin/stats/cohort-profile'),
    locals: {
      user: { id: userId },
      staffProfile: { staffRole: 'admin' },
    } as unknown as App.Locals,
  };
}

async function credentialFor(secret: string): Promise<AdminApiCredential> {
  const auth = await authenticateAdminApi(requestWith(secret));
  if (!auth.ok) throw new Error(`expected a valid credential: ${auth.message}`);
  return auth;
}

describe('admin API tiers and write capability (integration)', () => {
  const stamp = Date.now();
  let adminUserId = '';

  beforeAll(async () => {
    assertTestDatabase();
    const admin = await prisma.bauth_user.create({
      data: { email: `tiers.admin.${stamp}@epitech.eu`, role: 'admin' },
    });
    adminUserId = admin.id;
  });

  afterAll(async () => {
    try {
      await prisma.adminApi_Call.deleteMany({
        where: { actorUserId: adminUserId },
      });
      await prisma.bauth_user.delete({ where: { id: adminUserId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('lets a leadership token read the steering figures', async () => {
    const token = await mintToken(adminUserId, {
      label: 'Direction - test',
      tier: 'leadership',
    });
    const credential = await credentialFor(token.secret);

    expect(credential.caller.tier).toBe('leadership');
    expect(credential.writeEnabled).toBe(false);
    expect(await authorizeOperation(credential, LEADERSHIP_OPERATION)).toEqual({
      ok: true,
    });
  });

  // The whole point of the tier: an operational answer is not something a
  // leadership credential can reach, over any transport.
  it('refuses a leadership token an operational answer, and says why', async () => {
    const token = await mintToken(adminUserId, {
      label: 'Direction - refus',
      tier: 'leadership',
    });
    const refusal = await authorizeOperation(
      await credentialFor(token.secret),
      CORE_ONLY_OPERATION,
    );

    expect(refusal).toMatchObject({ ok: false, status: 403 });
    if (refusal.ok) throw new Error('unreachable');
    expect(refusal.message).toContain('pilotage');
  });

  it('refuses a leadership token any write, capability or not', async () => {
    const token = await mintToken(adminUserId, {
      label: 'Direction - écriture',
      tier: 'leadership',
    });
    expect(
      await authorizeOperation(
        await credentialFor(token.secret),
        WRITE_OPERATION,
      ),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it('refuses to mint a leadership token that could write', async () => {
    await expect(
      mintToken(adminUserId, {
        label: 'Direction - impossible',
        tier: 'leadership',
        writeEnabled: true,
      }),
    ).rejects.toThrow();
  });

  it('refuses a write to a read-only core token, and allows the reads', async () => {
    const token = await mintToken(adminUserId, { label: 'Core lecture' });
    const credential = await credentialFor(token.secret);

    expect(await authorizeOperation(credential, CORE_ONLY_OPERATION)).toEqual({
      ok: true,
    });
    const refusal = await authorizeOperation(credential, WRITE_OPERATION);
    expect(refusal).toMatchObject({ ok: false, status: 403 });
    if (refusal.ok) throw new Error('unreachable');
    expect(refusal.message).toContain('lecture seule');
  });

  it('lets a write-enabled core token write', async () => {
    const token = await mintToken(adminUserId, {
      label: 'Core écriture',
      writeEnabled: true,
    });
    const credential = await credentialFor(token.secret);

    expect(credential.writeEnabled).toBe(true);
    expect(await authorizeOperation(credential, WRITE_OPERATION)).toEqual({
      ok: true,
    });
  });

  // Writes are token-only on purpose: a mutation has to be attributable to a
  // credential somebody deliberately minted for it.
  it('reads with an admin session but refuses to write with one', async () => {
    const auth = await authenticateAdminApi(sessionRequest(adminUserId));
    expect(auth).toMatchObject({ ok: true });
    if (!auth.ok) throw new Error('unreachable');
    expect(auth.caller.tokenId).toBeNull();
    expect(auth.writeEnabled).toBe(false);

    expect(await authorizeOperation(auth, CORE_ONLY_OPERATION)).toEqual({
      ok: true,
    });
    const refusal = await authorizeOperation(auth, WRITE_OPERATION);
    expect(refusal).toMatchObject({ ok: false, status: 403 });
    if (refusal.ok) throw new Error('unreachable');
    expect(refusal.message).toContain('navigateur');
  });

  it('cuts writes off at their own quota while reads keep working', async () => {
    const token = await mintToken(adminUserId, {
      label: 'Quota écriture',
      writeEnabled: true,
    });
    const credential = await credentialFor(token.secret);

    await prisma.adminApi_Call.createMany({
      data: Array.from({ length: WRITE_CALL_QUOTA }, () => ({
        tokenId: token.id,
        actorUserId: adminUserId,
        operation: 'write_event_config',
        status: 200,
      })),
    });

    const refusal = await authorizeOperation(credential, WRITE_OPERATION);
    expect(refusal).toMatchObject({ ok: false, status: 429 });
    if (refusal.ok) throw new Error('unreachable');
    expect(refusal.message).toContain('modifications');

    // The read quota is far higher, so the same token can still be asked
    // questions: a spent write budget must not blind a client.
    expect(await authorizeOperation(credential, CORE_ONLY_OPERATION)).toEqual({
      ok: true,
    });

    await prisma.adminApi_Call.deleteMany({ where: { tokenId: token.id } });
  });
});
