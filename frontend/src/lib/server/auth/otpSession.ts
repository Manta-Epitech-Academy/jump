import { error, type Cookies } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from './cookies';
import { resolveOtpIdentity } from './otpAudience';

/**
 * The two server-side halves of the OTP credential: minting a code, and
 * exchanging one for a session. Both go through `resolveOtpIdentity` first.
 *
 * They are guarded here, and not by `emailOtpAudienceGate`, because
 * `createVerificationOTP` is declared `createAuthEndpoint.serverOnly` and
 * therefore carries no path: the gate's matcher reads `ctx.path` and cannot
 * see it. So this module is the chokepoint for everything that mints a code
 * without a request behind it, which is why `mintSigninOtp` lives here rather
 * than beside the broadcast personalisation code that calls it.
 */

/**
 * Mint a sign-in OTP for the given email through BetterAuth. The OTP is
 * stored in `bauth_verification` exactly as if the user had requested it
 * themselves, so the login page accepts it as-is, keyed off the address.
 *
 * Inherits the plugin's `expiresIn` (10 min). Callers should be aware that
 * a broadcast sent days before the action will expire by the time the
 * recipient reads it, the fastlogin links are the right tool for that.
 *
 * Throws for a staff address. No live path reaches that branch today - the
 * broadcast orchestrator derives the recipient's own address from the talent
 * or guardian relation, so a staff recipient returns an empty personalisation
 * before any mint - but the precondition was carried by a comment
 * ("staff log in via Microsoft OAuth so neither token kind applies to them")
 * rather than by anything that would refuse. The orchestrator treats a mint
 * failure as an empty variable, so enforcing it costs a batch nothing.
 */
export async function mintSigninOtp(email: string): Promise<string> {
  if (!(await resolveOtpIdentity(email))) {
    throw new Error(
      'Email OTP is reserved for talents and legal guardians; staff sign in through Microsoft OAuth',
    );
  }
  return await auth.api.createVerificationOTP({
    body: { email, type: 'sign-in' },
  });
}

/**
 * Forge a BetterAuth session for an already-verified email by minting a
 * sign-in OTP server-side and immediately consuming it, then forwarding the
 * resulting session cookies into SvelteKit's jar.
 *
 * Used by the fastlogin entry points (`/fastlogin`, `/parent/fastlogin`)
 * where the caller has already proven ownership of the address via a signed
 * magic-link token, so no user-facing OTP step is needed. The end state is
 * identical to the recipient typing the OTP themselves at `/login`.
 *
 * The caller still has to check that the address is the one its own route is
 * for (a talent token must not open a guardian's space, which is what the
 * separate audience claims are for). What it no longer has to remember is
 * whether the address may use this door at all: a staff address throws before
 * anything is written.
 */
export async function establishOtpSession({
  email,
  request,
  cookies,
}: {
  email: string;
  request: Request;
  cookies: Cookies;
}): Promise<void> {
  if (!(await resolveOtpIdentity(email))) {
    // A refusal the visitor can read, in the shape the fastlogin routes
    // already answer their own failures with. `mintSigninOtp` above throws a
    // plain Error instead: nobody is waiting on a broadcast batch, and its
    // caller logs the mint and carries on.
    throw error(403, "Ce lien ne permet pas d'ouvrir une session.");
  }

  const otp = await auth.api.createVerificationOTP({
    body: { email, type: 'sign-in' },
  });
  const authResponse = await auth.api.signInEmailOTP({
    body: { email, otp },
    asResponse: true,
    headers: request.headers,
  });
  if (!authResponse.ok) {
    throw error(500, "Échec de l'authentification.");
  }

  forwardAuthCookies(authResponse, cookies);
}
