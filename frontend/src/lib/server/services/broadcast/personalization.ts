/**
 * Per-recipient secrets that get baked into broadcast templates:
 *
 *   - `fastlogin_link`: signed magic link valid 30 days. The `/fastlogin`
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
 *
 * The JWT magic-link helpers live in `$lib/server/auth/fastloginToken` (no
 * BetterAuth dependency, so callers on the auth init path can use them).
 * This module owns only `mintSigninOtp`, which needs the BetterAuth instance.
 */

import { auth } from '$lib/server/auth';

/**
 * Mint a sign-in OTP for the given email through BetterAuth. The OTP is
 * stored in `bauth_verification` exactly as if the user had requested it
 * themselves, so the matching login page accepts it as-is — `/login` for a
 * talent, `/parent/login` for a parent (both drive BetterAuth's `sign-in`
 * email OTP, keyed off the address).
 *
 * Inherits the plugin's `expiresIn` (10 min). Callers should be aware that
 * a broadcast sent days before the action will expire by the time the
 * recipient reads it — the fastlogin links are the right tool for that.
 */
export async function mintSigninOtp(email: string): Promise<string> {
  return await auth.api.createVerificationOTP({
    body: { email, type: 'sign-in' },
  });
}
