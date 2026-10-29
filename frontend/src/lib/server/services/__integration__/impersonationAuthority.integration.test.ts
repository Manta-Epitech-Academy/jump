/**
 * An impersonation holds only while its admin is still one.
 *
 * The session BetterAuth mints is a row on the TARGET whose `impersonatedBy`
 * is a bare id, so demoting or deleting the admin left it standing, and the
 * hook's idle slide kept it alive for as long as the holder stayed active
 * (security audit run-1). The suite drives the real `handle` over a dev
 * member's route, the way a browser holding the impersonation cookie would,
 * guards and security headers included.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import { startImpersonation } from '$lib/server/auth/impersonate';
import {
  deleteStaffUser,
  updateStaffRole,
} from '$lib/server/services/staffAdminService';
import { handle } from '../../../../hooks.server';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import { cookieAfter, cookieJar, sessionCookie } from './authHttp';

const stamp = Date.now();

/**
 * One request to `/staff/dev` carrying `cookie`, through the whole hook, and
 * the `Cookie` header the browser sends next, read off the response.
 */
async function visitDevSpace(cookie: string) {
  const url = new URL(`${env.ORIGIN}/staff/dev`);
  const event = {
    request: new Request(url, { headers: { cookie } }),
    url,
    cookies: cookieJar(cookie).cookies,
    locals: {},
    route: { id: '/(staff)/staff/dev' },
    params: {},
  } as unknown as RequestEvent;
  const response = await handle({
    event,
    resolve: async () => new Response('ok'),
  });
  return {
    locals: event.locals,
    response,
    next: cookieAfter(cookie, response),
  };
}

describe('impersonation authority (integration)', () => {
  const userIds: string[] = [];
  let devId = '';
  let adminId = '';
  let adminCookie = '';
  let impersonationCookie = '';

  beforeAll(async () => {
    assertTestDatabase();
    const dev = await prisma.bauth_user.create({
      data: {
        email: `authority.dev.${stamp}@epitech.eu`,
        role: 'staff',
        staffProfile: { create: { staffRole: 'dev' } },
      },
    });
    devId = dev.id;
    userIds.push(devId);
  });

  // A fresh admin each time: two of the cases demote or delete theirs.
  beforeEach(async () => {
    const admin = await createAdminAccount(
      `authority.admin.${stamp}.${userIds.length}@epitech.eu`,
    );
    adminId = admin.id;
    userIds.push(adminId);
    adminCookie = await sessionCookie(adminId);

    const jar = cookieJar(adminCookie);
    const started = await startImpersonation(
      { kind: 'staff', id: devId },
      new Request(`${env.ORIGIN}/staff/admin/impersonate`, {
        method: 'POST',
        headers: { cookie: adminCookie },
      }),
      jar.cookies,
      adminId,
    );
    expect(started.ok).toBe(true);
    impersonationCookie = jar.header();
  });

  afterAll(async () => {
    try {
      await prisma.audit_ImpersonationEvent.deleteMany({
        where: { adminUserId: { in: userIds } },
      });
      await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  const openSessions = () =>
    prisma.bauth_session.count({ where: { impersonatedBy: adminId } });
  const openWindows = () =>
    prisma.audit_ImpersonationEvent.count({
      where: { adminUserId: adminId, endedAt: null },
    });

  it('acts as the target for an admin who still is one', async () => {
    const { locals, response } = await visitDevSpace(impersonationCookie);

    expect(response.status).toBe(200);
    expect(locals.user?.id).toBe(devId);
    expect(locals.impersonator).toMatchObject({
      userId: adminId,
      staffRole: 'admin',
    });
    expect(await openSessions()).toBe(1);
  });

  // The revocation answers the request itself, with the cookies on that very
  // response: left to the guard, which answers a visitor without rendering,
  // kit dropped them, and the browser kept the impersonation's cookie cache.
  it('hands a demoted admin back to their own session, and closes the window', async () => {
    expect((await updateStaffRole(adminId, 'dev')).ok).toBe(true);

    const { response, next } = await visitDevSpace(impersonationCookie);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${env.ORIGIN}/staff/dev`);
    expect(await openSessions()).toBe(0);
    expect(await openWindows()).toBe(0);

    // The next request is their own session, under the role they now hold.
    const after = await visitDevSpace(next);
    expect(after.response.status).toBe(200);
    expect(after.locals.user?.id).toBe(adminId);
    expect(after.locals.impersonator).toBeNull();
  });

  it('signs out the holder of a deleted admin, and closes the window', async () => {
    expect((await deleteStaffUser(adminId)).ok).toBe(true);

    const { response, next } = await visitDevSpace(impersonationCookie);

    expect(response.status).toBe(303);
    expect(await openSessions()).toBe(0);
    expect(await openWindows()).toBe(0);
    // No session cookie left, the cookie cache included.
    expect(next).not.toContain('session_token');
    expect(next).not.toContain('session_data');

    const after = await visitDevSpace(next);
    expect(after.response.status).toBe(303);
    expect(after.response.headers.get('location')).toContain('/staff/login');
    expect(after.locals.user).toBeNull();
  });
});
