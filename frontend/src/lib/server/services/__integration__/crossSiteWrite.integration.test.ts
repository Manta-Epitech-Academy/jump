/**
 * A write a browser sends from another site is refused by the hook, even with
 * a valid staff session.
 *
 * Kit's own CSRF check covers form content types only, so a script on a
 * same-site host (a CTFd instance under `epiboost.fr`) could POST a bodyless-
 * typed request to a JSON `+server.ts` with the admin's Lax cookie attached
 * (security audit run-1). The suite drives the real `handle` with a real admin
 * session against the route that sends a test mail from the official sender.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import { handle } from '../../../../hooks.server';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import { cookieJar, sessionCookie } from './authHttp';

const stamp = Date.now();

/** One POST to the test-send route as the admin, through the whole hook. */
async function postTestSend(cookie: string, headers: Record<string, string>) {
  const jar = cookieJar(cookie);
  const url = new URL(`${env.ORIGIN}/staff/admin/broadcasts/templates/test`);
  const event = {
    request: new Request(url, {
      method: 'POST',
      headers: { cookie, ...headers },
      body: '{}',
    }),
    url,
    cookies: jar.cookies,
    locals: {},
    route: { id: '/(staff)/staff/admin/broadcasts/templates/test' },
    params: {},
  } as unknown as RequestEvent;
  let resolved = false;
  const response = await handle({
    event,
    resolve: async () => {
      resolved = true;
      return new Response('ok');
    },
  });
  return { response, resolved };
}

describe('cross-site writes (integration)', () => {
  let adminId = '';
  let adminCookie = '';

  beforeAll(async () => {
    assertTestDatabase();
    const admin = await createAdminAccount(
      `crosssite.admin.${stamp}@epitech.eu`,
    );
    adminId = admin.id;
    adminCookie = await sessionCookie(adminId);
  });

  afterAll(async () => {
    try {
      await prisma.bauth_user.deleteMany({ where: { id: adminId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('refuses a POST a sibling host sent with the admin cookie', async () => {
    const { response, resolved } = await postTestSend(adminCookie, {
      'sec-fetch-site': 'same-site',
      origin: 'https://halloween2026.epiboost.fr',
    });
    expect(response.status).toBe(403);
    expect(resolved).toBe(false);
  });

  it('lets the same POST from Jump itself reach the route', async () => {
    const { response, resolved } = await postTestSend(adminCookie, {
      'sec-fetch-site': 'same-origin',
      origin: env.ORIGIN!,
    });
    expect(resolved).toBe(true);
    expect(response.status).toBe(200);
  });
});
