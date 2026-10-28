/**
 * The rules that decide whether a call happens at all, against a real database:
 * which tier may reach which operation, and who may write.
 *
 * Integration rather than unit, because both answers are settled by reading the
 * token row and the admin role behind it. Mocking that away would test the `if`s
 * and none of the behaviour.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import { mintToken } from '$lib/server/adminApi/tokens';
import {
  authenticateAdminApi,
  authorizeOperation,
  type AdminApiCredential,
} from '$lib/server/adminApi/guard';
import { ADMIN_API_OPERATIONS } from '$lib/server/adminApi/operations';
import { serveOpenApiDocument } from '$lib/server/adminApi/openapi';
import { TRANSPORT_OPERATIONS } from '$lib/server/adminApi/audit';

const LEADERSHIP_OPERATION = ADMIN_API_OPERATIONS.stats_cohort_profile;
const CORE_ONLY_OPERATION = ADMIN_API_OPERATIONS.ops_pdf_jobs_health;
const WRITE_OPERATION = ADMIN_API_OPERATIONS.write_event_config;
const UNTRUSTED_TEXT_OPERATION =
  ADMIN_API_OPERATIONS.stats_closing_testimonials;

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
    const admin = await createAdminAccount(`tiers.admin.${stamp}@epitech.eu`);
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
    expect(authorizeOperation(credential, LEADERSHIP_OPERATION)).toEqual({
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
    const refusal = authorizeOperation(
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
      authorizeOperation(await credentialFor(token.secret), WRITE_OPERATION),
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

    expect(authorizeOperation(credential, CORE_ONLY_OPERATION)).toEqual({
      ok: true,
    });
    const refusal = authorizeOperation(credential, WRITE_OPERATION);
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
    expect(authorizeOperation(credential, WRITE_OPERATION)).toEqual({
      ok: true,
    });
  });

  // A testimonial is typed by a student or a dev, returned verbatim. Next to the
  // write tools in one session, a sentence written as an instruction could ask
  // the model to call one, with only prose telling it not to.
  it('serves verbatim student text to a read-only token, never to one that can write', async () => {
    const reader = await mintToken(adminUserId, { label: 'Core témoignages' });
    expect(
      authorizeOperation(
        await credentialFor(reader.secret),
        UNTRUSTED_TEXT_OPERATION,
      ),
    ).toEqual({ ok: true });

    const writer = await mintToken(adminUserId, {
      label: 'Core écriture témoignages',
      writeEnabled: true,
    });
    const refusal = authorizeOperation(
      await credentialFor(writer.secret),
      UNTRUSTED_TEXT_OPERATION,
    );
    expect(refusal).toMatchObject({ ok: false, status: 403 });
    if (refusal.ok) throw new Error('unreachable');
    expect(refusal.message).toContain('lecture seule');
  });

  // Writes are token-only on purpose: a mutation has to be attributable to a
  // credential somebody deliberately minted for it.
  it('reads with an admin session but refuses to write with one', async () => {
    const auth = await authenticateAdminApi(sessionRequest(adminUserId));
    expect(auth).toMatchObject({ ok: true });
    if (!auth.ok) throw new Error('unreachable');
    expect(auth.caller.tokenId).toBeNull();
    expect(auth.writeEnabled).toBe(false);

    expect(authorizeOperation(auth, CORE_ONLY_OPERATION)).toEqual({
      ok: true,
    });
    const refusal = authorizeOperation(auth, WRITE_OPERATION);
    expect(refusal).toMatchObject({ ok: false, status: 403 });
    if (refusal.ok) throw new Error('unreachable');
    expect(refusal.message).toContain('navigateur');
  });

  // The HTTP reference is read with the same credential as the calls it
  // describes, so it shows what that credential can do and is logged like them.
  describe('the HTTP reference', () => {
    async function fetchReference(secret?: string) {
      const request = new Request('http://localhost/api/admin/openapi.json', {
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
      });
      const response = await serveOpenApiDocument({
        request,
        url: new URL(request.url),
        locals: {} as App.Locals,
      } as RequestEvent);
      return {
        status: response.status,
        body: (await response.json()) as {
          error?: string;
          paths?: Record<string, Record<string, unknown>>;
        },
      };
    }

    it('lists only what a read-only token can call, and records the read', async () => {
      const token = await mintToken(adminUserId, { label: 'Référence' });
      const { status, body } = await fetchReference(token.secret);

      expect(status).toBe(200);
      const methods = Object.values(body.paths ?? {}).flatMap((item) =>
        Object.keys(item),
      );
      expect(methods).toContain('get');
      expect(methods).not.toContain('post');
      expect(
        await prisma.adminApi_Call.count({
          where: {
            tokenId: token.id,
            operation: TRANSPORT_OPERATIONS.openapi,
            status: 200,
          },
        }),
      ).toBe(1);
    });

    it('refuses an unknown token like any other call, and records the refusal', async () => {
      const { status, body } = await fetchReference(`jump_unknown${stamp}`);

      expect(status).toBe(401);
      expect(body.error).toBeTruthy();
      expect(body.paths).toBeUndefined();
      expect(
        await prisma.adminApi_Call.count({
          where: { operation: TRANSPORT_OPERATIONS.openapi, status: 401 },
        }),
      ).toBeGreaterThan(0);
    });
  });
});
