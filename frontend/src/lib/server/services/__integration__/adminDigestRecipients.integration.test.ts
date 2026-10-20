/**
 * Who receives the Monday digest (#426): the admins chosen for it, and nobody
 * else.
 *
 * It used to go to every admin, and the role was then given to national
 * leadership so they could read the admin space, which put a working mail in
 * their inbox that nobody had decided. What is pinned here is the rule, through
 * the same API path the team uses to choose: an admin is not a recipient until
 * chosen, a chosen one stops being one the moment the role goes, and nobody
 * chosen means nothing is built or sent.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import { mintToken } from '$lib/server/adminApi/tokens';
import { adminApiRead, adminApiWrite } from '$lib/server/adminApi/route';
import { adminDigestRecipients } from '$lib/server/services/adminStats/adminDigestRecipients';
import { sendAdminDigest } from '$lib/server/services/adminDigest';
import { updateStaffRole } from '$lib/server/services/staffAdminService';

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/email', () => ({
  sendEmail,
  MAIL_FROM: 'Jump <noreply@example.test>',
}));

const getRecipients = adminApiRead('config_admin_digest');
const postRecipient = adminApiWrite('write_admin_digest_recipient');

/** Calls a handler the way SvelteKit would, with a bearer and a JSON body. */
async function call(
  handler: RequestHandler,
  secret: string,
  body?: unknown,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const request = new Request('http://localhost/api/admin/admin-digest', {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handler({
    request,
    url: new URL(request.url),
    locals: {} as App.Locals,
  } as RequestEvent);
  return { status: response.status, payload: await response.json() };
}

type AdminRow = { address: string; receivesDigest: boolean };

describe('weekly admin digest recipients (integration)', () => {
  const stamp = Date.now();
  const chosenAddress = `digest.chosen.${stamp}@epitech.eu`;
  const otherAddress = `digest.other.${stamp}@epitech.eu`;
  let chosenId = '';
  let otherId = '';
  let secret = '';

  async function adminRow(address: string): Promise<AdminRow | undefined> {
    const { payload } = await call(getRecipients, secret);
    return (payload.admins as { value: AdminRow[] }).value.find(
      (row) => row.address === address,
    );
  }

  beforeAll(async () => {
    assertTestDatabase();
    chosenId = (await createAdminAccount(chosenAddress)).id;
    otherId = (await createAdminAccount(otherAddress)).id;
    secret = (
      await mintToken(chosenId, { label: 'Destinataires', writeEnabled: true })
    ).secret;
  });

  afterAll(async () => {
    try {
      await prisma.adminApi_Call.deleteMany({
        where: { actorUserId: chosenId },
      });
      await prisma.bauth_user.deleteMany({
        where: { id: { in: [chosenId, otherId] } },
      });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('builds and sends nothing while no admin is chosen', async () => {
    const result = await sendAdminDigest();

    expect(result).toEqual({
      sent: 0,
      failed: 0,
      recipients: 0,
      summary: null,
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('lists every admin, none of them receiving it until chosen', async () => {
    expect(await adminRow(chosenAddress)).toEqual({
      address: chosenAddress,
      receivesDigest: false,
    });
    expect(await adminDigestRecipients()).not.toContain(chosenAddress);
  });

  it('sends it to a chosen admin only, and says so on the audit row', async () => {
    const first = await call(postRecipient, secret, {
      address: chosenAddress.toUpperCase(),
      receivesDigest: true,
    });
    expect(first.status).toBe(200);
    expect(first.payload.before).toEqual({
      address: chosenAddress,
      receivesDigest: false,
    });
    expect(first.payload.after).toEqual({
      address: chosenAddress,
      receivesDigest: true,
    });

    const repeat = await call(postRecipient, secret, {
      address: chosenAddress,
      receivesDigest: true,
    });
    expect(repeat.payload.before).toEqual(repeat.payload.after);

    const recipients = await adminDigestRecipients();
    expect(recipients).toContain(chosenAddress);
    expect(recipients).not.toContain(otherAddress);
    expect((await adminRow(chosenAddress))?.receivesDigest).toBe(true);

    const row = await prisma.adminApi_Call.findFirst({
      where: {
        actorUserId: chosenId,
        operation: 'write_admin_digest_recipient',
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(row?.after).toEqual({
      address: chosenAddress,
      receivesDigest: true,
    });
  });

  it('refuses an address that is not an admin, naming where one comes from', async () => {
    const { status, payload } = await call(postRecipient, secret, {
      address: `nobody.${stamp}@example.test`,
      receivesDigest: true,
    });

    expect(status).toBe(400);
    expect(String(payload.error)).toContain('config_admin_digest');
  });

  it('stops at a demotion, with nothing to undo', async () => {
    await call(postRecipient, secret, {
      address: otherAddress,
      receivesDigest: true,
    });
    expect(await adminDigestRecipients()).toContain(otherAddress);

    expect(await updateStaffRole(otherId, 'dev')).toEqual({ ok: true });

    expect(await adminDigestRecipients()).not.toContain(otherAddress);
    expect(await adminRow(otherAddress)).toBeUndefined();
    const { status } = await call(postRecipient, secret, {
      address: otherAddress,
      receivesDigest: true,
    });
    expect(status).toBe(400);
  });
});
