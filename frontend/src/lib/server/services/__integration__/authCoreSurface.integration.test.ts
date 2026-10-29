/**
 * BetterAuth's own routes over HTTP: the staff door, and nothing else.
 *
 * Mounted, the session-bound account, user and session routes acted on
 * `session.user`, which for an impersonation session is the target: an admin
 * impersonating a member of staff read their stored Microsoft tokens through
 * `get-access-token`, renamed them through `update-user` and signed them out
 * everywhere through `revoke-sessions`, none of it audited (security audit
 * run-1). The suite drives those routes with a session of the target's own,
 * since an impersonation session is that same session: what the owner cannot
 * reach, no one acting as them can.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { getAuth, pathSpellings, postAuth, sessionCookie } from './authHttp';

const stamp = Date.now();

describe('BetterAuth core HTTP surface (integration)', () => {
  let devId = '';
  let accountId = '';
  let devCookie = '';

  beforeAll(async () => {
    assertTestDatabase();

    const dev = await prisma.bauth_user.create({
      data: {
        email: `core-surface.dev.${stamp}@epitech.eu`,
        name: 'Core Surface',
        role: 'staff',
        staffProfile: { create: { staffRole: 'dev' } },
      },
    });
    devId = dev.id;
    const account = await prisma.bauth_account.create({
      data: {
        userId: devId,
        providerId: 'microsoft',
        accountId: `core-surface-oid-${stamp}`,
        accessToken: 'access-token-of-the-dev',
        refreshToken: 'refresh-token-of-the-dev',
        idToken: 'id-token-of-the-dev',
      },
    });
    accountId = account.id;

    devCookie = await sessionCookie(devId);
  });

  afterAll(async () => {
    try {
      await prisma.bauth_user.deleteMany({ where: { id: devId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('mounts none of the core routes but the staff door, even for a session', async () => {
    // Every other path better-auth 1.7.14 mounts, written out rather than read
    // off the library, so a release that adds one fails here only if it is
    // let through, never because this list went stale. The routes that end the
    // session come last, so that every other one meets a live session.
    const posts = [
      '/get-access-token',
      '/refresh-token',
      '/update-user',
      '/update-session',
      '/link-social',
      '/unlink-account',
      '/get-session',
      '/sign-up/email',
      '/sign-in/email',
      '/reset-password',
      '/verify-password',
      '/send-verification-email',
      '/change-email',
      '/change-password',
      '/request-password-reset',
      // The door is Microsoft's callback, not the parameterised route.
      '/callback/google',
      '/delete-user',
      '/revoke-session',
      '/revoke-other-sessions',
      '/revoke-sessions',
      '/sign-out',
    ];
    const gets = [
      '/get-session',
      '/verify-email',
      '/reset-password/some-token',
      '/list-sessions',
      '/list-accounts',
      '/delete-user/callback',
      '/account-info',
      '/ok',
      '/error',
      '/callback/google',
    ];

    // The routes validate strictly, so each gets the body it would act on.
    const bodies: Record<string, unknown> = {
      '/get-access-token': { accountId },
      '/refresh-token': { accountId },
      '/update-user': { name: 'renamed-by-impersonator' },
    };
    for (const path of gets.flatMap(pathSpellings)) {
      const response = await getAuth(`/api/auth${path}`, devCookie);
      expect.soft(response.status, `GET ${path}`).toBe(404);
    }
    for (const path of posts) {
      for (const spelling of pathSpellings(path)) {
        const response = await postAuth(
          `/api/auth${spelling}`,
          bodies[path] ?? {},
          devCookie,
        );
        expect.soft(response.status, `POST ${spelling}`).toBe(404);
      }
    }

    const dev = await prisma.bauth_user.findUniqueOrThrow({
      where: { id: devId },
      select: { name: true, _count: { select: { sessions: true } } },
    });
    expect(dev.name).toBe('Core Surface');
    expect(dev._count.sessions).toBe(1);
  });

  it('still opens the staff door, asking Microsoft for no refresh token', async () => {
    const response = await postAuth('/api/auth/sign-in/social', {
      provider: 'microsoft',
      callbackURL: '/staff/oauth/callback',
    });

    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    const authorize = new URL(url);
    expect(authorize.hostname).toBe('login.microsoftonline.com');
    // `offline_access` is what makes Microsoft issue a refresh token, the one
    // credential stored in `bauth_account` that outlives an impersonation
    // window. Jump never refreshes: the access token is read once, right
    // after sign-in, for the avatar.
    expect(authorize.searchParams.get('scope')?.split(' ').sort()).toEqual(
      ['User.Read', 'email', 'openid', 'profile'].sort(),
    );
  });

  // `scopes` is appended to the configured scope, so it would bring the
  // refresh token back; `idToken` signs in with a token minted elsewhere.
  it.each([
    ['scopes', { scopes: ['offline_access'] }],
    ['idToken', { idToken: { token: 'header.payload.signature' } }],
    ['additionalParams', { additionalParams: { prompt: 'none' } }],
  ])(
    'refuses a staff-door body carrying %s',
    async (_key, extra: Record<string, unknown>) => {
      const response = await postAuth('/api/auth/sign-in/social', {
        provider: 'microsoft',
        callbackURL: '/staff/oauth/callback',
        ...extra,
      });

      expect(response.status).toBe(400);
    },
  );
});
