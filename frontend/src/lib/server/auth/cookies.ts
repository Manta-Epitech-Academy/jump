import type { Cookies } from '@sveltejs/kit';

/**
 * Forwards Set-Cookie headers from a BetterAuth Response into SvelteKit's cookie jar.
 *
 * SvelteKit's `cookies.set()` calls `encodeURIComponent` on the value, so we
 * decode first to avoid double-encoding the token.
 */
export function forwardAuthCookies(response: Response, cookies: Cookies) {
  const setCookieHeaders = response.headers.getSetCookie();

  for (const cookieStr of setCookieHeaders) {
    const [firstPart, ...restParts] = cookieStr.split(';');
    const nameValueStr = firstPart.trim();
    const equalsIndex = nameValueStr.indexOf('=');
    if (equalsIndex === -1) continue;

    const name = nameValueStr.substring(0, equalsIndex).trim();
    const encodedValue = nameValueStr.substring(equalsIndex + 1).trim();
    const value = decodeURIComponent(encodedValue);

    const opts: Parameters<Cookies['set']>[2] = { path: '/' };
    for (const part of restParts) {
      const trimmed = part.trim();
      const lower = trimmed.toLowerCase();
      if (lower === 'httponly') opts.httpOnly = true;
      else if (lower === 'secure') opts.secure = true;
      else if (lower.startsWith('max-age='))
        opts.maxAge = parseInt(lower.split('=')[1], 10);
      else if (lower.startsWith('samesite='))
        opts.sameSite = lower.split('=')[1] as 'lax' | 'strict' | 'none';
      else if (lower.startsWith('path=')) opts.path = trimmed.split('=')[1];
    }

    cookies.set(name, value, opts);
  }
}
