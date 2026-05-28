/**
 * Signed magic-link tokens for passwordless sign-in.
 *
 *   - talent (`/fastlogin`): verifies the JWT and creates a BetterAuth
 *     session for the talent, same end-state as completing the OTP flow
 *     at `/login`.
 *   - parent (`/parent/fastlogin`): same idea for the parent of a talent,
 *     signed with a separate audience claim and consumed by the parent
 *     route, which signs in the `bauth_user` with `role: 'parent'`.
 *
 * Kept free of any `$lib/server/auth` import on purpose: BetterAuth's OTP
 * callback imports `otp.ts`, which mints parent links here, so routing the
 * token helpers through `auth` would close an import cycle. Only `mintSigninOtp`
 * (in `broadcast/personalization.ts`) needs the BetterAuth instance.
 *
 * Security model:
 *
 *   - HS256 signed with the 256-bit `BETTER_AUTH_SECRET`, so brute-forcing
 *     a valid token is infeasible. The consuming routes (`/fastlogin`,
 *     `/parent/fastlogin`) deliberately skip the IP-keyed rate-limiter
 *     that guards `/login` OTP verify: against an unguessable token an
 *     IP bucket adds nothing, and it would lock out legitimate cohorts
 *     opening a broadcast from a shared NAT (school wifi, sibling
 *     households).
 *
 *   - Known replay gap: 7-day TTL, no `jti` / replay store. A holder of
 *     one valid link can call their fastlogin route repeatedly and
 *     accumulate `bauth_session` rows for the talent / parent the token
 *     was minted for. There is no escalation, the holder already has
 *     full session-create power via that token, only DB bloat on the one
 *     user. Acceptable today; the fix when it stops being acceptable is
 *     to mint with `setJti(crypto.randomUUID())` and gate consumption on
 *     a `FastloginTokenUse(jti UNIQUE, consumedAt)` table, with the
 *     check + insert in one transaction. One-shot would break legitimate
 *     multi-device clicks, so the table should record uses and the route
 *     should cap per-jti uses (e.g. 20) rather than reject after the
 *     first.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '$env/dynamic/private';
import { base } from '$app/paths';

const FASTLOGIN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
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

function decodePayload(payload: JWTPayload): FastloginPayload {
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

function signFor(audience: string, payload: FastloginPayload): Promise<string> {
  return new SignJWT({
    talent_id: payload.talentId,
    recipient_id: payload.recipientId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(audience)
    .setSubject(payload.email)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + FASTLOGIN_TTL_SECONDS)
    .sign(getKey());
}

async function verifyFor(
  audience: string,
  token: string,
): Promise<FastloginPayload> {
  const { payload } = await jwtVerify(token, getKey(), {
    issuer: ISSUER,
    audience,
  });
  return decodePayload(payload);
}

export function mintFastloginToken(payload: FastloginPayload): Promise<string> {
  return signFor(AUDIENCE, payload);
}

export function verifyFastloginToken(token: string): Promise<FastloginPayload> {
  return verifyFor(AUDIENCE, token);
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
 * filters by `role: 'parent'` to refuse mismatched users. `talentId` is
 * carried for diagnostics only; the session is keyed off the parent email.
 */
export function mintParentFastloginToken(
  payload: FastloginPayload,
): Promise<string> {
  return signFor(PARENT_AUDIENCE, payload);
}

export function verifyParentFastloginToken(
  token: string,
): Promise<FastloginPayload> {
  return verifyFor(PARENT_AUDIENCE, token);
}

export function buildParentFastloginLink(token: string): string {
  const origin = env.ORIGIN;
  if (!origin) throw new Error('ORIGIN is not configured');
  return `${origin}${base}/parent/fastlogin?token=${encodeURIComponent(token)}`;
}
