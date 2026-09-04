import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * Shared primitive for short-lived, signed dev-tooling cookies.
 *
 * Both outbound dev-redirect controls hang a tiny token off the browser:
 * `armRealSends` (lift the trap for my session) and `devRedirectPin` (route
 * trapped login mail to me while logged out). They want the exact same shape:
 * an `expiresAt`/`userId` pair, HMAC-signed so it can't be forged in devtools.
 * This module owns that shape so the two stay byte-for-byte identical and the
 * signing never drifts.
 *
 * Token format: `<expiresAtMs>.<userId>.<sig>`. `expiresAt` is numeric, `userId`
 * is a cuid, `sig` is hex, none contains a dot, so the three segments split
 * unambiguously on `.`.
 */
function secret(): string {
  const s = env.BETTER_AUTH_SECRET;
  if (!s) throw new Error('BETTER_AUTH_SECRET is not configured');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

/** Build a signed token carrying an expiry and the bound user's id. */
export function signCookieToken(expiresAt: number, userId: string): string {
  const body = `${expiresAt}.${userId}`;
  return `${body}.${sign(body)}`;
}

export type SignedCookieToken = { expiresAt: number; userId: string };

/**
 * Verify a token and return its payload, or null if it's missing, malformed,
 * tampered with, or expired. The signature check is timing-safe; the expiry is
 * enforced here so a stale token is treated as absent.
 */
export function parseCookieToken(
  raw: string | undefined,
): SignedCookieToken | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [expStr, userId, sig] = parts;
  const expected = sign(`${expStr}.${userId}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return { expiresAt, userId };
}
