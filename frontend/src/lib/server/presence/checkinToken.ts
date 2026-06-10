/**
 * Signed QR check-in tokens for émargement self-marking.
 *
 * Staff project (or print to PDF) a QR per (event, day, half-day). The QR points
 * at the talent route `(talent)/presence/[token]`; scanning it marks the
 * authenticated talent present for exactly that slot. The token is a HS256 JWT
 * signed with `BETTER_AUTH_SECRET` carrying `{ eventId, day, slot }` so a code
 * cannot be repurposed for another slot or event by editing the URL.
 *
 * Validity model: the token's `exp` is only a stale-link backstop (set past the
 * event). The REAL gate is the per-slot `EventPresenceClosure` row checked at
 * check-in time, so closing a half-day instantly stops self-marking even though
 * the same printed QR is still cryptographically valid. There is intentionally
 * no per-token replay store: many talents scan the same code, that is the point.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';
import {
  PRESENCE_SLOTS,
  type DateKey,
  type PresenceSlot,
} from '$lib/domain/eventPresence';

const ISSUER = 'jump';
const AUDIENCE = 'jump:presence_checkin';

function getKey(): Uint8Array {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not configured');
  return new TextEncoder().encode(secret);
}

export interface CheckinPayload {
  eventId: string;
  day: DateKey;
  slot: PresenceSlot;
}

function isSlot(value: unknown): value is PresenceSlot {
  return (
    typeof value === 'string' &&
    (PRESENCE_SLOTS as readonly string[]).includes(value)
  );
}

/**
 * Mint a check-in token. `expiresAt` is a hard backstop past which the link is
 * dead regardless of closure state; callers pass a little after the event ends.
 */
export function mintCheckinToken(
  payload: CheckinPayload,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({ day: payload.day, slot: payload.slot })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(payload.eventId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getKey());
}

/** Verify and decode a token; returns null on any signature/expiry/shape error. */
export async function verifyCheckinToken(
  token: string,
): Promise<CheckinPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const eventId = payload.sub;
    const extra = payload as JWTPayload & { day?: unknown; slot?: unknown };
    if (typeof eventId !== 'string' || !eventId) return null;
    if (typeof extra.day !== 'string' || !extra.day) return null;
    if (!isSlot(extra.slot)) return null;
    return { eventId, day: extra.day, slot: extra.slot };
  } catch {
    return null;
  }
}

export function buildCheckinLink(token: string): string {
  const origin = env.ORIGIN;
  if (!origin) throw new Error('ORIGIN is not configured');
  return `${origin}${base}/presence/${encodeURIComponent(token)}`;
}
