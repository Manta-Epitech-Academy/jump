/**
 * The admin plugin's HTTP surface, which is none.
 *
 * Mounted, its routes were a second door to what Jump does through its own
 * operations, guarded by `bauth_user.role` alone: `impersonate-user` opened a
 * session on a guardian with no `Audit_ImpersonationEvent` row, and `set-role`
 * left `StaffProfile.staffRole` behind (security audit run-1). The suite drives
 * them with a genuine admin session, the one principal they used to admit, and
 * then checks that impersonation still works the way Jump runs it, through
 * `auth.api.*` from `server/auth/impersonate.ts`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import {
  startImpersonation,
  stopImpersonation,
} from '$lib/server/auth/impersonate';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import { cookieJar, pathSpellings, postAuth, sessionCookie } from './authHttp';

const stamp = Date.now();

function requestWith(cookie: string): Request {
  return new Request(`${env.ORIGIN}/staff/admin/impersonate`, {
    method: 'POST',
    headers: { cookie },
  });
}

describe('admin plugin HTTP surface (integration)', () => {
  const userIds: string[] = [];
  let adminId = '';
  let devId = '';
  let parentId = '';
  let adminCookie = '';

  beforeAll(async () => {
    assertTestDatabase();

    const admin = await createAdminAccount(`surface.admin.${stamp}@epitech.eu`);
    adminId = admin.id;
    const dev = await prisma.bauth_user.create({
      data: {
        email: `surface.dev.${stamp}@epitech.eu`,
        role: 'staff',
        staffProfile: { create: { staffRole: 'dev' } },
      },
    });
    devId = dev.id;
    const parent = await prisma.bauth_user.create({
      data: { email: `surface.parent.${stamp}@e2e.invalid`, role: 'parent' },
    });
    parentId = parent.id;
    userIds.push(adminId, devId, parentId);

    adminCookie = await sessionCookie(adminId);
  });

  afterAll(async () => {
    try {
      await prisma.audit_ImpersonationEvent.deleteMany({
        where: { adminUserId: adminId },
      });
      await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('mounts none of the plugin routes over HTTP, even for an admin', async () => {
    // Every path better-auth 1.7.2 mounts for the plugin, written out rather
    // than derived the way `auth.ts` derives them, so a derivation that went
    // wrong cannot also agree with itself here.
    const pluginPaths = [
      '/admin/set-role',
      '/admin/get-user',
      '/admin/create-user',
      '/admin/update-user',
      '/admin/list-users',
      '/admin/list-user-sessions',
      '/admin/unban-user',
      '/admin/ban-user',
      '/admin/impersonate-user',
      '/admin/stop-impersonating',
      '/admin/revoke-user-session',
      '/admin/revoke-user-sessions',
      '/admin/remove-user',
      '/admin/set-user-password',
      '/admin/has-permission',
    ];

    for (const path of pluginPaths.flatMap(pathSpellings)) {
      const response = await postAuth(
        `/api/auth${path}`,
        { userId: parentId, role: 'admin' },
        adminCookie,
      );
      expect(response.status, path).toBe(404);
    }

    const parent = await prisma.bauth_user.findUniqueOrThrow({
      where: { id: parentId },
      select: { role: true },
    });
    expect(parent.role).toBe('parent');
    expect(
      await prisma.bauth_session.count({ where: { impersonatedBy: adminId } }),
    ).toBe(0);
  });

  it('still impersonates through Jump, and closes the audit window on the way back', async () => {
    const jar = cookieJar(adminCookie);

    const started = await startImpersonation(
      { kind: 'staff', id: devId },
      requestWith(adminCookie),
      jar.cookies,
      adminId,
    );
    expect(started).toEqual({ ok: true, redirect: '/staff/dev' });
    const opened = await prisma.audit_ImpersonationEvent.findFirstOrThrow({
      where: { adminUserId: adminId, targetUserId: devId },
    });
    expect(opened.endedAt).toBeNull();

    const back = cookieJar(jar.header());
    expect(
      await stopImpersonation(requestWith(jar.header()), back.cookies, adminId),
    ).toBe(true);

    const closed = await prisma.audit_ImpersonationEvent.findUniqueOrThrow({
      where: { id: opened.id },
    });
    expect(closed.endedAt).not.toBeNull();
    expect(
      await prisma.bauth_session.count({ where: { impersonatedBy: adminId } }),
    ).toBe(0);
    // The session the admin started from is the one they are handed back.
    expect(back.header()).toContain(adminCookie);
  });
});
