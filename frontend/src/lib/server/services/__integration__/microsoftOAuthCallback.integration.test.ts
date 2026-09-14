/**
 * The regression sensor #297 asked for: a test that drives a real Microsoft
 * OAuth round-trip through BetterAuth's own callback code, rather than
 * inserting rows by hand. #296 (BetterAuth 1.7 requiring `bauth_account.issuer`)
 * went unnoticed for three days because nothing in the suite exercised this
 * path: E2E staff sessions come from `/api/test/login-as` (a direct
 * `bauth_session` insert), and `bauthAccountSchema.integration.test.ts` only
 * checks the table's shape via `prisma.bauth_account` directly.
 *
 * This test uses only BetterAuth's public surface, no internals:
 * - `createAuthOptions` (from `$lib/server/auth`) with the Microsoft provider
 *   pointed at a local fake HTTP server instead of login.microsoftonline.com,
 *   reusing every other real config value (Prisma adapter, `account.modelName`,
 *   `accountLinking`, `mapProfileToUser`) so this can't drift from what
 *   production actually wires.
 * - `auth.api.signInSocial` to mint a genuine, signed `state` and its cookie,
 *   the same call `impersonate.ts` uses for `impersonateUser`.
 * - `auth.handler` to run the real `/api/auth/callback/microsoft` route.
 *
 * The fake token endpoint returns an UNSIGNED id_token on purpose: on this
 * authorization-code path (as opposed to native ID-token sign-in),
 * `getUserInfo` only `decodeJwt`s the token and reads its claims, it never
 * verifies the signature, so a hand-crafted token exercises the exact same
 * code a real one would.
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
 * every staff member with `account_not_linked`. The two now sit side by side on
 * purpose, because they are one decision read in both directions: a staff row
 * links, a row that is not staff does not.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createHttpTestServer,
  convertSetCookieToCookie,
} from 'better-auth/test';
import { betterAuth } from 'better-auth';
import { createAuthOptions } from '$lib/server/auth';
import { prisma } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { assertTestDatabase } from './testDatabase';

const stamp = Date.now();

function base64url(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function craftIdToken(claims: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  return `${header}.${payload}.`;
}

const ISSUER = 'https://login.microsoftonline.com/test-tenant/v2.0';

/**
 * Drive one full Microsoft sign-in against a fake token endpoint and return
 * where the callback sent the browser.
 *
 * The crafted id_token deliberately carries NO `email_verified` claim, because
 * Entra ID emits none unless it is declared as an optional claim on the app
 * registration. The fixture used to assert one, which is precisely why it could
 * never have caught #348: with the claim present, `userInfo.emailVerified` was
 * true and the link path's provider-side test passed for a reason production
 * does not have. Leaving it out means these tests prove that
 * `mapProfileToUser` in `server/auth.ts` is what supplies it.
 */
async function signInWithMicrosoft(opts: { oid: string; email: string }) {
  const fakeMicrosoft = await createHttpTestServer();
  fakeMicrosoft.setRequestHandler((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        access_token: 'fake-access-token',
        id_token: craftIdToken({
          oid: opts.oid,
          iss: ISSUER,
          email: opts.email,
          name: 'Microsoft OAuth Callback Test',
        }),
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    );
  });

  try {
    const testAuth = betterAuth(
      createAuthOptions({
        authority: fakeMicrosoft.url,
        tenantId: 'test-tenant',
        disableProfilePhoto: true,
      }),
    );

    const signIn = await testAuth.api.signInSocial({
      body: { provider: 'microsoft', callbackURL: '/' },
      asResponse: true,
    });
    const { url } = (await signIn.json()) as { url: string };
    const state = new URL(url).searchParams.get('state');
    expect(state).toBeTruthy();

    const cookie = convertSetCookieToCookie(signIn.headers).get('cookie') ?? '';

    const callback = await testAuth.handler(
      new Request(
        `${env.ORIGIN}/api/auth/callback/microsoft?state=${state}&code=fake-authorization-code`,
        { headers: { cookie } },
      ),
    );

    // A schema-drift failure (the #296 shape) surfaces as an error redirect
    // rather than a thrown exception, so the outcome is checked through the
    // redirect target, not only via the DB row.
    expect(callback.status).toBeGreaterThanOrEqual(300);
    expect(callback.status).toBeLessThan(400);

    return { location: callback.headers.get('location') ?? '' };
  } finally {
    await fakeMicrosoft.close();
  }
}

describe('Microsoft OAuth callback (integration)', () => {
  const userIds: string[] = [];

  beforeAll(() => {
    assertTestDatabase();
  });

  afterAll(async () => {
    // `StaffProfile.user` and `bauth_account.user` are both `onDelete: Cascade`,
    // so removing the users takes every row these cases created with them.
    await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('creates a valid bauth_account row through the real BetterAuth callback', async () => {
    // Discriminated by the file's own prefix, not by the stamp alone:
    // `bauthAccountSchema.integration.test.ts` builds its accountId as
    // `oid-${Date.now()}` against this same issuer, and that pair is UNIQUE,
    // so two files whose module loads land in the same millisecond would
    // collide on it and fail here as a phantom OAuth regression.
    const oid = `microsoft-oauth-${stamp}`;
    const email = `microsoft-oauth-${stamp}@e2e.invalid`;

    const { location } = await signInWithMicrosoft({ oid, email });
    expect(location).not.toContain('error');

    const account = await prisma.bauth_account.findFirst({
      where: { accountId: oid, providerId: 'microsoft' },
      include: { user: { select: { id: true, emailVerified: true } } },
    });
    expect(account?.issuer).toBe(ISSUER);
    if (account) userIds.push(account.userId);

    // The invariant `20260915120000_verify_staff_emails_for_oauth_relink`
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
    const email = `microsoft-relink-${stamp}@e2e.invalid`;

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
    expect(account?.issuer).toBe(ISSUER);
  });

  it('refuses to link an @epitech.eu address that belongs to a talent', async () => {
    // The shape a Salesforce contact carrying a staff address produces, and the
    // reason `accountLinking.requireLocalEmailVerified` is left at its default
    // rather than switched off: were this row to link, `staff/oauth/callback`
    // would find neither a `StaffProfile` nor a `StaffInvitation` and delete the
    // `bauth_user`, and `Talent.userId` being `onDelete: SetNull` the talent
    // would silently lose their account. A blocked login is the better failure,
    // so the refusal is asserted rather than merely tolerated.
    const oid = `microsoft-talent-${stamp}`;
    const email = `microsoft-talent-${stamp}@e2e.invalid`;

    const existing = await prisma.bauth_user.create({
      data: { email, name: 'Talent Lookalike', role: 'student' },
      select: { id: true, emailVerified: true },
    });
    userIds.push(existing.id);
    expect(existing.emailVerified).toBe(false);

    const { location } = await signInWithMicrosoft({ oid, email });
    expect(location).toContain('error=account_not_linked');

    const account = await prisma.bauth_account.findFirst({
      where: { accountId: oid, providerId: 'microsoft' },
    });
    expect(account).toBeNull();
  });
});
