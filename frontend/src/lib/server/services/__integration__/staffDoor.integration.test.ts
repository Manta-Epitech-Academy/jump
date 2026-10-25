/**
 * Who the staff Microsoft door lets through, asserted on what a refusal leaves
 * behind rather than on the refusal alone.
 *
 * The door used to decide in `staff/oauth/callback`, a page BetterAuth redirects
 * to after it has already created or linked the `bauth_user` and set the session
 * cookie. Only the first-party login page names that page as its `callbackURL`;
 * a direct `POST /api/auth/sign-in/social` naming `/` skipped it, and kept the
 * session and the link (security audit run-1). So every case here signs in
 * through `microsoftSignIn.ts`, which names `/`: what is asserted must hold
 * without the staff callback ever running.
 *
 * A refused sign-in must leave nothing: no session, no Microsoft link, no new
 * `bauth_user`. The talent case also checks the `Talent` row, because the
 * account the door must not take is the talent's login, and losing it to
 * `Talent.userId`'s `onDelete: SetNull` would be silent.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { MICROSOFT_TEST_ISSUER, signInWithMicrosoft } from './microsoftSignIn';

const stamp = Date.now();

const userIds: string[] = [];
const talentIds: string[] = [];
let inviterId: string;

const address = (slug: string, domain = 'epitech.eu') =>
  `staff-door-${slug}-${stamp}@${domain}`;
const oidFor = (slug: string) => `staff-door-${slug}-${stamp}`;

async function invite(email: string): Promise<void> {
  await prisma.staffInvitation.create({
    data: { email, staffRole: 'dev', invitedByUserId: inviterId },
  });
}

/** An existing row the door may meet, in the state a real one is in. */
async function existingUser(
  slug: string,
  data: { role: string; staffRole?: null },
): Promise<string> {
  const user = await prisma.bauth_user.create({
    data: {
      email: address(slug),
      name: `Staff Door ${slug}`,
      role: data.role,
      // Every row the link test admits: a guardian is written verified, a
      // talent is promoted the first time they use the OTP door, a member of
      // staff holds it as an invariant.
      emailVerified: true,
      ...(data.staffRole === null && {
        staffProfile: { create: { staffRole: null } },
        accounts: {
          create: {
            issuer: MICROSOFT_TEST_ISSUER,
            accountId: oidFor(slug),
            providerId: 'microsoft',
          },
        },
      }),
    },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
}

/**
 * The code a refusal lands on `/staff/login` with. BetterAuth appends an
 * `error_description` beside it, which the page does not read.
 */
function refusalCode(location: string): string | null {
  const url = new URL(location, 'http://jump.test');
  return url.pathname === '/staff/login' ? url.searchParams.get('error') : null;
}

/** What a refusal must leave behind for an address: nothing of the door's. */
async function expectNothingLeft(email: string, slug: string): Promise<void> {
  const user = await prisma.bauth_user.findUnique({
    where: { email },
    select: { id: true, sessions: { select: { id: true } } },
  });
  expect(user?.sessions ?? []).toEqual([]);
  expect(
    await prisma.bauth_account.findFirst({
      where: { accountId: oidFor(slug), providerId: 'microsoft' },
      select: { id: true },
    }),
  ).toBeNull();
}

describe('staff Microsoft door (integration)', () => {
  beforeAll(async () => {
    assertTestDatabase();
    const inviter = await prisma.bauth_user.create({
      data: {
        email: address('inviter'),
        name: 'Inviter',
        role: 'admin',
      },
      select: { id: true },
    });
    inviterId = inviter.id;
    userIds.push(inviter.id);
  });

  afterAll(async () => {
    await prisma.talent.deleteMany({ where: { id: { in: talentIds } } });
    // `StaffInvitation.invitedBy` is `onDelete: Cascade`, so the inviter takes
    // every invitation with it. A user the admitted case created is found by
    // address, since nothing handed back its id.
    const created = await prisma.bauth_user.findMany({
      where: { email: { startsWith: 'staff-door-', contains: `-${stamp}@` } },
      select: { id: true },
    });
    await prisma.bauth_user.deleteMany({
      where: { id: { in: [...userIds, ...created.map((u) => u.id)] } },
    });
  });

  it('refuses an address outside @epitech.eu, and creates no account', async () => {
    const email = address('outsider', 'e2e.invalid');

    const { location, sessionIssued } = await signInWithMicrosoft({
      oid: oidFor('outsider'),
      email,
    });

    expect(refusalCode(location)).toBe('UnauthorizedDomain');
    expect(sessionIssued).toBe(false);
    expect(await prisma.bauth_user.findUnique({ where: { email } })).toBeNull();
    await expectNothingLeft(email, 'outsider');
  });

  it('refuses an @epitech.eu address nobody invited, and creates no account', async () => {
    const email = address('uninvited');

    const { location, sessionIssued } = await signInWithMicrosoft({
      oid: oidFor('uninvited'),
      email,
    });

    expect(refusalCode(location)).toBe('NotInvited');
    expect(sessionIssued).toBe(false);
    expect(await prisma.bauth_user.findUnique({ where: { email } })).toBeNull();
    await expectNothingLeft(email, 'uninvited');
  });

  it("never links onto a talent's account, even one whose address was invited", async () => {
    // A Salesforce contact holding a staff address produces exactly this row.
    // The invitation does not make it the door's: turning it into staff would
    // lock the talent out of the OTP door, so the clash is for a human.
    const userId = await existingUser('talent', { role: 'student' });
    const talent = await prisma.talent.create({
      data: { nom: 'Door', prenom: 'Talent', userId },
      select: { id: true },
    });
    talentIds.push(talent.id);
    await invite(address('talent'));

    const { location, sessionIssued } = await signInWithMicrosoft({
      oid: oidFor('talent'),
      email: address('talent'),
    });

    expect(refusalCode(location)).toBe('NotStaffAccount');
    expect(sessionIssued).toBe(false);
    await expectNothingLeft(address('talent'), 'talent');
    const stillThere = await prisma.talent.findUnique({
      where: { id: talent.id },
      select: { userId: true },
    });
    expect(stillThere?.userId).toBe(userId);
    const user = await prisma.bauth_user.findUnique({
      where: { id: userId },
      select: { role: true, staffProfile: { select: { id: true } } },
    });
    expect(user).toEqual({ role: 'student', staffProfile: null });
  });

  it("never links onto a legal guardian's account", async () => {
    await existingUser('parent', { role: 'parent' });

    const { location, sessionIssued } = await signInWithMicrosoft({
      oid: oidFor('parent'),
      email: address('parent'),
    });

    expect(refusalCode(location)).toBe('NotStaffAccount');
    expect(sessionIssued).toBe(false);
    await expectNothingLeft(address('parent'), 'parent');
  });

  it('refuses a linked member whose role was withdrawn', async () => {
    // The returning sign-in: the Microsoft link already exists, so BetterAuth
    // asks the door again with the account it found. A profile with no role is
    // what withdrawing one leaves.
    const userId = await existingUser('withdrawn', {
      role: 'staff',
      staffRole: null,
    });

    const { location, sessionIssued } = await signInWithMicrosoft({
      oid: oidFor('withdrawn'),
      email: address('withdrawn'),
    });

    expect(refusalCode(location)).toBe('NotInvited');
    expect(sessionIssued).toBe(false);
    expect(await prisma.bauth_session.count({ where: { userId } })).toBe(0);
  });

  it('admits an invited address', async () => {
    // The door's other half. Provisioning the profile from the invitation is the
    // staff callback's job, which this sign-in skips: the person holds a session
    // they were allowed to have, and nothing staff-capable yet.
    const email = address('invited');
    await invite(email);

    const { location, sessionIssued } = await signInWithMicrosoft({
      oid: oidFor('invited'),
      email,
    });

    expect(location).toBe('/');
    expect(sessionIssued).toBe(true);
  });
});
