/**
 * BetterAuth's HTTP surface, as the suites that pin what it mounts reach it.
 *
 * Requests go through `auth.handler`, the function the catch-all
 * `routes/api/auth/[...all]` hands every `/api/auth/*` request to, so a status
 * asserted here is the one a browser would get, `server/auth/httpSurface`
 * included. `auth.api.*` never passes through it, which is why these suites
 * cannot use it.
 */

import { createHmac } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth';

export function postAuth(
  path: string,
  body: unknown,
  cookie?: string,
): Promise<Response> {
  return auth.handler(
    new Request(`${env.ORIGIN}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // The router checks the origin on every POST; ORIGIN is what
        // `createAuthOptions` trusts, so a 404 is the closure and not an
        // origin refusal.
        origin: env.ORIGIN!,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

export function getAuth(path: string, cookie?: string): Promise<Response> {
  return auth.handler(
    new Request(`${env.ORIGIN}${path}`, {
      headers: cookie ? { cookie } : {},
    }),
  );
}

/**
 * Spellings of a path a match could miss. Each one must not reach a handler
 * either, whether `httpSurface` or the router is what turns it away. Every
 * hyphen is encoded, not the first alone, and a spelling that comes out as the
 * path itself (no hyphen to encode) is listed once.
 */
export function pathSpellings(path: string): string[] {
  return [
    ...new Set([
      path,
      `${path}/`,
      path.toUpperCase(),
      path.replaceAll('-', '%2D'),
    ]),
  ];
}

/**
 * A `Cookie` header carrying a fresh session for `userId`, for the doors no
 * test can walk (an admin signs in through Microsoft). The session is created
 * by BetterAuth's own adapter and its cookie signed the way `better-call` signs
 * it, the same shape `routes/api/test/login-as` mints.
 */
export async function sessionCookie(userId: string): Promise<string> {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(userId);
  const signature = createHmac('sha256', ctx.secret)
    .update(session.token)
    .digest('base64');
  const value = encodeURIComponent(`${session.token}.${signature}`);
  return `${ctx.authCookies.sessionToken.name}=${value}`;
}

/**
 * SvelteKit's cookie jar, reduced to what `forwardAuthCookies` writes and the
 * hook reads, read back as the `Cookie` header the browser would send next. A
 * cookie set with `maxAge: 0` is gone, as BetterAuth expires one.
 */
export function cookieJar(initial: string) {
  const values = new Map(
    initial.split('; ').map((pair) => {
      const at = pair.indexOf('=');
      return [pair.slice(0, at), decodeURIComponent(pair.slice(at + 1))];
    }),
  );
  const cookies = {
    get: (name: string) => values.get(name),
    set: (name: string, value: string, opts?: { maxAge?: number }) => {
      if (opts?.maxAge === 0) values.delete(name);
      else values.set(name, value);
    },
  } as unknown as Cookies;
  const header = () =>
    [...values]
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join('; ');
  return { cookies, header };
}

/**
 * The `Cookie` header a browser sends after `response`: `cookie` with the
 * response's own `Set-Cookie` headers applied, a cookie expired by
 * `Max-Age=0` dropped. Read off the response itself, never off a jar the code
 * under test wrote into, since kit only puts its jar on a response it renders.
 */
export function cookieAfter(cookie: string, response: Response): string {
  const values = new Map(
    cookie
      .split('; ')
      .filter(Boolean)
      .map((pair) => {
        const at = pair.indexOf('=');
        return [pair.slice(0, at), pair.slice(at + 1)];
      }),
  );
  for (const line of response.headers.getSetCookie()) {
    const [pair, ...attributes] = line.split(';');
    const at = pair.indexOf('=');
    const name = pair.slice(0, at).trim();
    const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a));
    if (expired) values.delete(name);
    else values.set(name, pair.slice(at + 1).trim());
  }
  return [...values].map(([name, value]) => `${name}=${value}`).join('; ');
}
