/**
 * The regression sensor #297 asked for: a test that drives a real Microsoft
 * OAuth round-trip through BetterAuth's own callback code, rather than
 * inserting rows by hand. #296 (BetterAuth 1.7 requiring `bauth_account.issuer`)
 * went unnoticed for three days because nothing in the suite exercised this
 * path: E2E staff sessions come from `/api/test/login-as` (a direct
 * `bauth_session` insert). `bauthSchema.integration.test.ts` now compares every
 * BetterAuth table with what the installed version writes; this file proves
 * the round-trip on top of it.
 *
 * The round-trip itself lives in `microsoftSignIn.ts`, shared with
 * `staffDoor.integration.test.ts`: BetterAuth's public surface only, the real
 * `createAuthOptions`, a fake token endpoint standing in for Microsoft.
 *
 * If a future schema drift removes/renames a column the Prisma adapter needs
 * (as #296 did: reproduced by hand while writing this test, dropping
 * `bauth_account.issuer` from a real test database), `handleOAuthUserInfo`
 * catches the underlying Prisma error and the callback redirects to
 * `/api/auth/error?error=internal_server_error` instead of the real
 * `callbackURL` - caught below by the redirect-target assertion, before the
 * DB assertion ever runs.
 *
 * #348 added the second and third cases, and they cover the half #296's own
 * migration broke: the REGISTER path was the only one under test, so nothing
 * noticed that deleting every `bauth_account` row left the LINK path refusing
 * every staff member with `account_not_linked`. The two sit side by side on
 * purpose, because they are one decision read in both directions: a row that has
 * proven its address links, a row that has never authenticated does not.
 *
 * What that decision is NOT is a guard over who reaches the staff space, and
 * reading it as one is the mistake this file used to encourage. Every guardian
 * and every talent who has ever signed in has proven their address, so they
 * pass it too; who is let through belongs to the staff door in
 * `auth/staffDoor.ts`, and is covered in `staffDoor.integration.test.ts`. The
 * addresses below are therefore ones that door admits: an invited one for the
 * register path, a provisioned member's for the relink.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { signInWithMicrosoft } from './microsoftSignIn';

const stamp = Date.now();

describe('Microsoft OAuth callback (integration)', () => {
  const userIds: string[] = [];
  let inviterId: string;

  beforeAll(async () => {
    assertTestDatabase();
    const inviter = await prisma.bauth_user.create({
      data: {
        email: `microsoft-oauth-inviter-${stamp}@epitech.eu`,
        name: 'Inviter',
        role: 'admin',
      },
      select: { id: true },
    });
    inviterId = inviter.id;
    userIds.push(inviter.id);
  });

  afterAll(async () => {
    // `StaffProfile.user`, `bauth_account.user` and `StaffInvitation.invitedBy`
    // are all `onDelete: Cascade`, so removing the users takes every row these
    // cases created with them.
    await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('creates a valid bauth_account row through the real BetterAuth callback', async () => {
    const oid = `microsoft-oauth-${stamp}`;
    const email = `microsoft-oauth-${stamp}@epitech.eu`;
    await prisma.staffInvitation.create({
      data: { email, staffRole: 'admin', invitedByUserId: inviterId },
    });

    const { location } = await signInWithMicrosoft({ oid, email });
    expect(location).not.toContain('error');

    const account = await prisma.bauth_account.findFirst({
      where: { accountId: oid, providerId: 'microsoft' },
      include: { user: { select: { id: true, emailVerified: true } } },
    });
    expect(account).not.toBeNull();
    if (account) userIds.push(account.userId);

    // The invariant `20260915140000_verify_staff_emails_for_oauth_relink`
    // restores for existing rows, held at creation for new ones. Without it a
    // freshly registered staff account is born unable to survive the next time
    // its `bauth_account` row goes away, and the repair would be owed again.
    expect(account?.user.emailVerified).toBe(true);
  });

  it('links a staff account whose bauth_account row is gone', async () => {
    // Exactly the state `20260831120000_add_bauth_account_issuer` left behind:
    // the `bauth_user` and its `StaffProfile` survive, the OAuth link does not.
    // The member signs in again and BetterAuth has to rebuild the link, which
    // is what that migration promised `accountLinking.trustedProviders` would
    // do and what `requireLocalEmailVerified` refused until #348.
    const oid = `microsoft-relink-${stamp}`;
    const email = `microsoft-relink-${stamp}@epitech.eu`;

    const existing = await prisma.bauth_user.create({
      data: {
        email,
        name: 'Relink Staff',
        role: 'staff',
        emailVerified: true,
        staffProfile: { create: { staffRole: 'admin' } },
      },
      select: { id: true },
    });
    userIds.push(existing.id);

    const { location } = await signInWithMicrosoft({ oid, email });
    expect(location).not.toContain('error');

    const account = await prisma.bauth_account.findFirst({
      where: { accountId: oid, providerId: 'microsoft' },
    });
    // Linked onto the account that already existed, not onto a second one: a
    // duplicate `bauth_user` would take the `StaffProfile`, the role and the
    // whole history with it.
    expect(account?.userId).toBe(existing.id);
  });

  it('refuses a row that has never authenticated, and says so on our own page', async () => {
    // What `accountLinking.requireLocalEmailVerified` actually refuses, which is
    // narrower than the option's name suggests: a `bauth_user` still carrying
    // the `false` it was created with. A guardian's row never carries it
    // (`setParentLogin` writes `true`) and a talent's stops carrying it the
    // first time they use the OTP door, so this is NOT what keeps either of them
    // out of the staff space. That is `auth/staffDoor.ts`, asserted next door in
    // `staffDoor.integration.test.ts`. Keep the option at its default anyway:
    // switching it off would admit every pre-existing row, which is a wider door
    // for no gain now that the relink works.
    const oid = `microsoft-stranger-${stamp}`;
    const email = `microsoft-stranger-${stamp}@e2e.invalid`;

    const existing = await prisma.bauth_user.create({
      data: { email, name: 'Never Signed In', role: 'student' },
      select: { id: true, emailVerified: true },
    });
    userIds.push(existing.id);
    expect(existing.emailVerified).toBe(false);

    const { location } = await signInWithMicrosoft({ oid, email });
    // The half a member of staff actually sees, and the reason it is asserted
    // here rather than trusted: BetterAuth's code has to arrive on OUR page as
    // `?error=`, because that is the key `/staff/login`'s load answers in
    // French. Left to the default it lands on `/api/auth/error`, BetterAuth's
    // page, reading `account_not_linked` in English. `onAPIError.errorURL` in
    // `server/auth.ts` is what redirects it, and it is inside the config this
    // file drives whole, so removing it fails right here. BetterAuth runs this
    // test before it asks the staff door, which is why the address needs no
    // `@epitech.eu` to reach it.
    expect(location).toBe('/staff/login?error=account_not_linked');

    const account = await prisma.bauth_account.findFirst({
      where: { accountId: oid, providerId: 'microsoft' },
    });
    expect(account).toBeNull();
  });
});
