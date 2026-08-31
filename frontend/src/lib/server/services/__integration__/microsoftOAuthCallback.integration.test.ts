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
 *   `accountLinking`) so this can't drift from what production actually wires.
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
 */
import { describe, it, expect, afterAll } from 'vitest';
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

describe('Microsoft OAuth callback (integration)', () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.bauth_user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('creates a valid bauth_account row through the real BetterAuth callback', async () => {
    assertTestDatabase();

    const oid = `oid-${stamp}`;
    const issuer = 'https://login.microsoftonline.com/test-tenant/v2.0';
    const email = `microsoft-oauth-${stamp}@e2e.invalid`;

    const fakeMicrosoft = await createHttpTestServer();
    fakeMicrosoft.setRequestHandler((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          access_token: 'fake-access-token',
          id_token: craftIdToken({
            oid,
            iss: issuer,
            email,
            email_verified: true,
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

      const cookie =
        convertSetCookieToCookie(signIn.headers).get('cookie') ?? '';

      const callback = await testAuth.handler(
        new Request(
          `${env.ORIGIN}/api/auth/callback/microsoft?state=${state}&code=fake-authorization-code`,
          { headers: { cookie } },
        ),
      );

      // A schema-drift failure (the #296 shape) surfaces as an error redirect
      // rather than a thrown exception, so the outcome is checked here too,
      // not only via the DB row below.
      expect(callback.status).toBeGreaterThanOrEqual(300);
      expect(callback.status).toBeLessThan(400);
      expect(callback.headers.get('location') ?? '').not.toContain('error');

      const account = await prisma.bauth_account.findFirst({
        where: { accountId: oid, providerId: 'microsoft' },
      });
      expect(account?.issuer).toBe(issuer);
      if (account) userIds.push(account.userId);
    } finally {
      await fakeMicrosoft.close();
    }
  });
});
