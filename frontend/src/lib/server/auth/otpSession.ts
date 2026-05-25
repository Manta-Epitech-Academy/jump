import { error, type Cookies } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { forwardAuthCookies } from './cookies';

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
 * Caller's responsibility: ensure the target `bauth_user` exists and is
 * authorised for the route before calling. This only performs the credential
 * exchange and throws a 500 if BetterAuth rejects it.
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
