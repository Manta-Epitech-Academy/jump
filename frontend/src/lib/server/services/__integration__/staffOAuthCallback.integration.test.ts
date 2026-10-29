/**
 * `staff/oauth/callback` provisions only a user the staff door admitted.
 *
 * The route is public to the guards and acts on a bare GET, so any session
 * reaches it, the OTP door's included. It used to read "whoever lands here was
 * admitted already" and provision whoever did from a pending invitation naming
 * their address: a talent signed in by code became staff, and lost the OTP
 * door, on the clash the door itself refuses (security audit run-1). What
 * proves the door ran is a Microsoft account on the row, since the door decides
 * every Microsoft create, link and sign-in.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { GET } from '../../../../routes/(staff)/staff/oauth/callback/+server';
import { assertTestDatabase } from './testDatabase';
import { cookieJar } from './authHttp';

// The avatar is fetched from Microsoft Graph with the member's token.
vi.mock('$lib/server/services/microsoftProfile', () => ({
  syncMicrosoftAvatar: vi.fn(async () => {}),
}));

const stamp = Date.now();

/** The callback, for the session of `user`, as the hook hands it over. */
async function land(user: { id: string; email: string; role: string }) {
  try {
    const response = await GET({
      locals: { user },
      cookies: cookieJar('').cookies,
    } as unknown as Parameters<typeof GET>[0]);
    return {
      status: response.status,
      location: response.headers.get('location'),
    };
  } catch (err) {
    if (!isRedirect(err)) throw err;
    return { status: err.status, location: err.location };
  }
}

describe('staff OAuth callback (integration)', () => {
  const userIds: string[] = [];
  let inviterId = '';

  beforeAll(async () => {
    assertTestDatabase();
    const inviter = await prisma.bauth_user.create({
      data: { email: `callback-inviter-${stamp}@epitech.eu`, role: 'admin' },
      select: { id: true },
    });
    inviterId = inviter.id;
    userIds.push(inviter.id);
  });

  afterAll(async () => {
    try {
      await prisma.staffInvitation.deleteMany({
        where: { invitedByUserId: inviterId },
      });
      await prisma.talent.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  async function invited(slug: string, role: 'student' | 'staff') {
    const email = `callback-${slug}-${stamp}@epitech.eu`;
    const user = await prisma.bauth_user.create({
      data: { email, role, emailVerified: true },
      select: { id: true, email: true, role: true },
    });
    userIds.push(user.id);
    await prisma.staffInvitation.create({
      data: { email, staffRole: 'dev', invitedByUserId: inviterId },
    });
    return { ...user, role: user.role ?? role };
  }

  it('refuses a session the OTP door opened, and leaves the row as it was', async () => {
    const talent = await invited('otp', 'student');
    await prisma.talent.create({
      data: { userId: talent.id, prenom: 'Camille', nom: 'Code' },
    });

    expect(await land(talent)).toEqual({
      status: 303,
      location: '/staff/login?error=NotStaffAccount',
    });
    expect(
      await prisma.staffProfile.findUnique({ where: { userId: talent.id } }),
    ).toBeNull();
    expect(
      await prisma.bauth_user.findUniqueOrThrow({
        where: { id: talent.id },
        select: { role: true },
      }),
    ).toEqual({ role: 'student' });
    expect(
      await prisma.staffInvitation.count({ where: { email: talent.email } }),
    ).toBe(1);
  });

  it('provisions a member the staff door admitted through Microsoft', async () => {
    const member = await invited('microsoft', 'staff');
    await prisma.bauth_account.create({
      data: {
        id: `callback-account-${stamp}`,
        userId: member.id,
        providerId: 'microsoft',
        accountId: `callback-oid-${stamp}`,
      },
    });

    expect(await land(member)).toMatchObject({ status: 303 });
    expect(
      await prisma.staffProfile.findUnique({
        where: { userId: member.id },
        select: { staffRole: true },
      }),
    ).toEqual({ staffRole: 'dev' });
    expect(
      await prisma.staffInvitation.count({ where: { email: member.email } }),
    ).toBe(0);
  });
});
