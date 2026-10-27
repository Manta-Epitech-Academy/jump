/**
 * One real Microsoft sign-in through BetterAuth, for the suites that need the
 * staff door's actual code path rather than rows inserted by hand.
 *
 * Only BetterAuth's public surface is used, no internals:
 * - `createAuthOptions` (from `$lib/server/auth`) with the Microsoft provider
 *   pointed at a local fake HTTP server instead of login.microsoftonline.com,
 *   reusing every other real config value (Prisma adapter, `account.modelName`,
 *   `accountLinking`, `mapProfileToUser`, `validateUserInfo`, `onAPIError`) so
 *   this can't drift from what production actually wires.
 * - `auth.handler` for both routes the browser calls, the only two BetterAuth
 *   serves over HTTP (`server/auth/httpSurface.ts`): `/api/auth/sign-in/social`
 *   to mint a genuine, signed `state` and its cookie, then
 *   `/api/auth/callback/microsoft`.
 *
 * The sign-in always names `/` as its `callbackURL`, never
 * `/staff/oauth/callback`. That is the request an attacker sends, and it is the
 * point: whatever these suites assert about who gets in must hold without the
 * staff callback ever running.
 *
 * The fake token endpoint returns an UNSIGNED id_token on purpose: on this
 * authorization-code path (as opposed to native ID-token sign-in),
 * `getUserInfo` only `decodeJwt`s the token and reads its claims, it never
 * verifies the signature, so a hand-crafted token exercises the exact same
 * code a real one would.
 */
import { expect } from 'vitest';
import {
  createHttpTestServer,
  convertSetCookieToCookie,
} from 'better-auth/test';
import { betterAuth } from 'better-auth';
import { createAuthOptions } from '$lib/server/auth';
import { env } from '$env/dynamic/private';

export const MICROSOFT_TEST_ISSUER =
  'https://login.microsoftonline.com/test-tenant/v2.0';

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

/**
 * Drive one full Microsoft sign-in against a fake token endpoint and return
 * where the callback sent the browser, and whether it was handed a session.
 *
 * The crafted id_token deliberately carries NO `email_verified` claim, because
 * Entra ID emits none unless it is declared as an optional claim on the app
 * registration. The fixture used to assert one, which is precisely why it could
 * never have caught #348: with the claim present, `userInfo.emailVerified` was
 * true and the link path's provider-side test passed for a reason production
 * does not have. Leaving it out means these tests prove that
 * `mapProfileToUser` in `server/auth.ts` is what supplies it.
 */
export async function signInWithMicrosoft(opts: {
  oid: string;
  email: string;
}): Promise<{ location: string; sessionIssued: boolean }> {
  const fakeMicrosoft = await createHttpTestServer();
  fakeMicrosoft.setRequestHandler((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        access_token: 'fake-access-token',
        id_token: craftIdToken({
          oid: opts.oid,
          iss: MICROSOFT_TEST_ISSUER,
          email: opts.email,
          name: 'Microsoft Sign-In Test',
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

    const signIn = await testAuth.handler(
      new Request(`${env.ORIGIN}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: env.ORIGIN! },
        body: JSON.stringify({ provider: 'microsoft', callbackURL: '/' }),
      }),
    );
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

    return {
      location: callback.headers.get('location') ?? '',
      sessionIssued: callback.headers
        .getSetCookie()
        .some((c) => /session_token=[^;]+/.test(c)),
    };
  } finally {
    await fakeMicrosoft.close();
  }
}
