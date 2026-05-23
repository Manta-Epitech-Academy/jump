/**
 * Per-recipient secrets that get baked into broadcast templates:
 *
 *   - `fastlogin_link`: signed magic link valid 2 months. The `/fastlogin`
 *     route verifies the JWT and creates a BetterAuth session for the
 *     talent — same end-state as completing the OTP flow at `/login`.
 *   - `parent_fastlogin_link`: same idea for the parent of a talent. Signed
 *     with a separate audience claim and consumed by `/parent/fastlogin`,
 *     which signs in the bauth_user with `role: 'parent'`.
 *   - `otp_code`: a 6-digit code minted through BetterAuth's
 *     `createVerificationOTP`. Identical to what the regular login flow
 *     stores in `bauth_verification`, so the recipient enters it at
 *     `/login` and signs in. Inherits the plugin's `expiresIn` (10 min).
 *
 * Staff log in via Microsoft OAuth so neither token kind applies to them.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth';
import { base } from '$app/paths';

const FASTLOGIN_TTL_SECONDS = 60 * 60 * 24 * 60; // 2 months
const ISSUER = 'jump';
const AUDIENCE = 'jump:fastlogin';
const PARENT_AUDIENCE = 'jump:parent_fastlogin';

function getKey(): Uint8Array {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not configured');
  return new TextEncoder().encode(secret);
}

export interface FastloginPayload {
  /** Email at mint time — used to look up (or bootstrap) `bauth_user`. */
  email: string;
  /** Talent id at mint time. Mostly diagnostic; lookup happens by email. */
  talentId?: string;
  /**
   * BroadcastRecipient id this token belongs to. Lets `/fastlogin` mark
   * `openedAt` on click even when the link wasn't wrapped in an `<a>` and
   * thus didn't pass through `linkRewriter` / the `tracking_id` hook.
   */
  recipientId?: string;
}

export async function mintFastloginToken(
  payload: FastloginPayload,
): Promise<string> {
  return new SignJWT({
    talent_id: payload.talentId,
    recipient_id: payload.recipientId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(payload.email)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + FASTLOGIN_TTL_SECONDS)
    .sign(getKey());
}

export async function verifyFastloginToken(
  token: string,
): Promise<FastloginPayload> {
  const { payload } = await jwtVerify(token, getKey(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const email = payload.sub;
  if (typeof email !== 'string' || !email) {
    throw new Error('Invalid fastlogin token: missing sub');
  }
  const extra = payload as JWTPayload & {
    talent_id?: unknown;
    recipient_id?: unknown;
  };
  return {
    email,
    talentId: typeof extra.talent_id === 'string' ? extra.talent_id : undefined,
    recipientId:
      typeof extra.recipient_id === 'string' ? extra.recipient_id : undefined,
  };
}

export function buildFastloginLink(token: string): string {
  const origin = env.ORIGIN;
  if (!origin) throw new Error('ORIGIN is not configured');
  return `${origin}${base}/fastlogin?token=${encodeURIComponent(token)}`;
}

/**
 * Parent variant of the fastlogin token. Same JWT structure as the talent
 * token but signed with a separate audience claim so the two can't be used
 * interchangeably — a talent token presented to `/parent/fastlogin` (or
 * vice versa) fails verification.
 *
 * `email` is the parent's address — the bauth_user lookup at the route
 * filters by `role: 'parent'` to refuse mismatched users. `talentId` lets
 * the route surface which kid the parent is logging in for.
 */
export async function mintParentFastloginToken(
  payload: FastloginPayload,
): Promise<string> {
  return new SignJWT({
    talent_id: payload.talentId,
    recipient_id: payload.recipientId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(PARENT_AUDIENCE)
    .setSubject(payload.email)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + FASTLOGIN_TTL_SECONDS)
    .sign(getKey());
}

export async function verifyParentFastloginToken(
  token: string,
): Promise<FastloginPayload> {
  const { payload } = await jwtVerify(token, getKey(), {
    issuer: ISSUER,
    audience: PARENT_AUDIENCE,
  });
  const email = payload.sub;
  if (typeof email !== 'string' || !email) {
    throw new Error('Invalid parent fastlogin token: missing sub');
  }
  const extra = payload as JWTPayload & {
    talent_id?: unknown;
    recipient_id?: unknown;
  };
  return {
    email,
    talentId: typeof extra.talent_id === 'string' ? extra.talent_id : undefined,
    recipientId:
      typeof extra.recipient_id === 'string' ? extra.recipient_id : undefined,
  };
}

export function buildParentFastloginLink(token: string): string {
  const origin = env.ORIGIN;
  if (!origin) throw new Error('ORIGIN is not configured');
  return `${origin}${base}/parent/fastlogin?token=${encodeURIComponent(token)}`;
}

/**
 * Mint a sign-in OTP for the given email through BetterAuth. The OTP is
 * stored in `bauth_verification` exactly as if the user had requested it
 * from `/login`, so `/login`'s verify step accepts it as-is.
 *
 * Inherits the plugin's `expiresIn` (10 min). Callers should be aware that
 * a broadcast sent days before the action will expire by the time the
 * recipient reads it — `fastlogin_link` is the right tool for that.
 */
export async function mintTalentOtp(email: string): Promise<string> {
  return await auth.api.createVerificationOTP({
    body: { email, type: 'sign-in' },
  });
}
