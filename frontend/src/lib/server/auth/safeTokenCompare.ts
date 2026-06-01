import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of two secret tokens.
 * Prevents timing side-channel attacks on bearer token verification.
 */
export function safeTokenEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
