import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { randomBytes, createHmac } from 'node:crypto';
import { prisma } from '$lib/server/db';

/**
 * Load-test helper: mints a BetterAuth session for an arbitrary user by
 * inserting a `bauth_session` row directly and signing the session cookie
 * the same way BetterAuth (via `better-call`) does — `<token>.<base64-hmac>`
 * URL-encoded — so the existing `auth.api.getSession()` reads it back
 * indistinguishably from a real login.
 *
 * Why bypass `auth.api.signInEmailOTP`: that path writes to
 * `bauth_verification.identifier` which carries a UNIQUE index, so any
 * concurrency (multiple VUs, same email) trips P2002. Direct insert has
 * no contention and is N× faster.
 *
 * **Hard gates**:
 *   - 404 unless `LOAD_TEST_SECRET` is set server-side. Keep out of prod.
 *   - Bearer must match that secret.
 */
// BetterAuth prefixes the cookie with `__Secure-` whenever it issues secure
// cookies (https origin or production). Mirror that here, otherwise on
// preprod (https) we'd write `better-auth.session_token` while `getSession()`
// reads `__Secure-better-auth.session_token` — silent auth miss.
const SESSION_COOKIE_BASENAME = 'better-auth.session_token';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signCookieValue(value: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(value).digest('base64');
  return encodeURIComponent(`${value}.${sig}`);
}

export const POST: RequestHandler = async ({ request }) => {
  const secret = env.LOAD_TEST_SECRET;
  if (!secret) throw error(404, 'Not Found');

  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (token !== secret) throw error(401, 'Unauthorized');

  const authSecret = env.BETTER_AUTH_SECRET;
  if (!authSecret) throw error(500, 'BETTER_AUTH_SECRET not configured');

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    userId?: string;
  } | null;
  if (!body || (!body.email && !body.userId)) {
    throw error(400, 'Body must include `email` or `userId`');
  }

  const user = await prisma.bauth_user.findUnique({
    where: body.userId
      ? { id: body.userId }
      : { email: body.email!.toLowerCase().trim() },
    select: { id: true, email: true },
  });
  if (!user) throw error(404, 'User not found');

  const sessionToken = randomBytes(32).toString('hex');
  await prisma.bauth_session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  const cookieValue = signCookieValue(sessionToken, authSecret);
  const url = new URL(request.url);
  const isHttps = url.protocol === 'https:';
  const cookieName = isHttps
    ? `__Secure-${SESSION_COOKIE_BASENAME}`
    : SESSION_COOKIE_BASENAME;
  const secureAttr = isHttps ? '; Secure' : '';
  const setCookie =
    `${cookieName}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax; ` +
    `Max-Age=${SESSION_TTL_MS / 1000}${secureAttr}`;

  return new Response(
    JSON.stringify({ ok: true, userId: user.id, email: user.email }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': setCookie,
      },
    },
  );
};
