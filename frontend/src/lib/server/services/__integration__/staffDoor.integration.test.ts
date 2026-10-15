/**
 * What the staff Microsoft door is allowed to destroy when it refuses someone.
 *
 * `microsoftOAuthCallback.integration.test.ts` covers the half BetterAuth owns:
 * who links onto whom. This covers the half Jump owns, which is what
 * `staff/oauth/callback` does next when the person turns out not to be staff.
 * The two refusals there used to delete the `bauth_user` outright, and the row
 * they were handed is not always one the door created: `accountLinking` resolves
 * the door onto any existing row whose local `emailVerified` is true, which is
 * every guardian and every talent who has ever used the OTP door.
 *
 * So the case that matters is not the refusal, it is what survives it. A talent
 * detached from their account by `Talent.userId`'s `onDelete: SetNull` is silent
 * and unrecoverable, which is why it is asserted here on the `Talent` row rather
 * than only on the `bauth_user`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { discardStaffSignIn } from '$lib/server/auth/staffDoor';
import { assertTestDatabase } from './testDatabase';

const stamp = Date.now();
const ISSUER = 'https://login.microsoftonline.com/staff-door-test/v2.0';

const userIds: string[] = [];
const talentIds: string[] = [];

/**
 * Stand a `bauth_user` in the state the callback meets: signed in through the
 * Microsoft door, so carrying the link BetterAuth just made and the session it
 * just minted. Returns both ids, because the contract is about which of them
 * outlives the refusal.
 */
async function signedInThroughTheStaffDoor(
  slug: string,
  data: { role: string; emailVerified: boolean },
): Promise<{ userId: string; sessionId: string }> {
  const user = await prisma.bauth_user.create({
    data: {
      email: `staff-door-${slug}-${stamp}@e2e.invalid`,
      name: `Staff Door ${slug}`,
      role: data.role,
      emailVerified: data.emailVerified,
      accounts: {
        create: {
          issuer: ISSUER,
          accountId: `staff-door-${slug}-${stamp}`,
          providerId: 'microsoft',
        },
      },
      sessions: {
        create: {
          token: `staff-door-${slug}-${stamp}`,
          expiresAt: new Date(Date.now() + 60_000),
        },
      },
    },
    select: { id: true, sessions: { select: { id: true } } },
  });
  userIds.push(user.id);
  return { userId: user.id, sessionId: user.sessions[0].id };
}

describe('discardStaffSignIn (integration)', () => {
  beforeAll(() => {
    assertTestDatabase();
  });

  afterAll(async () => {
    await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
    await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('releases a talent account instead of deleting it', async () => {
    const { userId, sessionId } = await signedInThroughTheStaffDoor('talent', {
      role: 'student',
      // What the OTP door leaves behind: BetterAuth promotes an unverified row
      // the first time it signs one in, so this is the state of every talent who
      // has ever logged in, not an unusual one.
      emailVerified: true,
    });
    const talent = await prisma.talent.create({
      data: { nom: 'Door', prenom: 'Talent', userId },
      select: { id: true },
    });
    talentIds.push(talent.id);

    await discardStaffSignIn(userId, sessionId);

    const stillThere = await prisma.talent.findUnique({
      where: { id: talent.id },
      select: { userId: true },
    });
    // The whole point: the login the talent uses is still attached to them.
    expect(stillThere?.userId).toBe(userId);
    expect(
      await prisma.bauth_user.findUnique({ where: { id: userId } }),
    ).not.toBeNull();

    // And the door itself is closed again behind them: the link it made and the
    // session it minted are both gone, so the staff door is not a standing way
    // into a talent's account.
    expect(
      await prisma.bauth_account.findFirst({ where: { userId } }),
    ).toBeNull();
    expect(
      await prisma.bauth_session.findUnique({ where: { id: sessionId } }),
    ).toBeNull();
  });

  it('releases a legal guardian account instead of deleting it', async () => {
    // `ensureParentAccount` and `changeParentEmail` both write
    // `emailVerified: true`, so a guardian reaches the link path in exactly this
    // state without ever having signed in.
    const { userId, sessionId } = await signedInThroughTheStaffDoor('parent', {
      role: 'parent',
      emailVerified: true,
    });

    await discardStaffSignIn(userId, sessionId);

    expect(
      await prisma.bauth_user.findUnique({ where: { id: userId } }),
    ).not.toBeNull();
    expect(
      await prisma.bauth_account.findFirst({ where: { userId } }),
    ).toBeNull();
    expect(
      await prisma.bauth_session.findUnique({ where: { id: sessionId } }),
    ).toBeNull();
  });

  it('deletes an account the door itself created', async () => {
    // The register path's leftover: BetterAuth minted this row for a sign-in
    // that is being refused, nothing else points at it, and keeping it would
    // accumulate one junk login per rejected attempt.
    const { userId, sessionId } = await signedInThroughTheStaffDoor(
      'stranger',
      {
        role: 'user',
        emailVerified: true,
      },
    );

    await discardStaffSignIn(userId, sessionId);

    expect(
      await prisma.bauth_user.findUnique({ where: { id: userId } }),
    ).toBeNull();
  });
});
