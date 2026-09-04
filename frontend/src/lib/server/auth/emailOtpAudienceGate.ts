import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { BetterAuthPlugin } from 'better-auth';
import { resolveOtpIdentity } from './otpAudience';

/**
 * Refuse every email-OTP route for an address that is not a talent's or a
 * legal guardian's.
 *
 * The `/login` page action already filtered by role, but BetterAuth's own
 * routes are mounted UNDER it (`routes/api/auth/[...all]`) and `guards.ts`
 * treats `/api/*` as public, so `POST /api/auth/email-otp/send-verification-otp`
 * followed by `POST /api/auth/sign-in/email-otp` minted a full staff session
 * for any address in `bauth_user`, tenant restriction and MFA bypassed.
 *
 * **A `before` hook, not the `sendVerificationOTP` callback.** The tempting
 * fix is to refuse where the mail is composed, and it does not work: the
 * plugin's send endpoint calls `resolveOTP` (which writes the
 * `bauth_verification` row) BEFORE it looks the user up or calls the callback,
 * and it awaits the callback through `runInBackgroundOrAwait`, which swallows
 * the rejection and still answers `200 {success:true}`. Refusing there would
 * leave a live, usable code behind. A `before` hook runs ahead of the handler,
 * so nothing is written at all - and it covers `auth.api.*` calls as well as
 * HTTP requests, since both reach the endpoint through the same dispatcher.
 *
 * **Default-deny over the plugin's paths.** The matcher takes the whole
 * `/email-otp/*` prefix rather than listing today's nine routes, so an
 * endpoint added by a future `better-auth` release is refused on arrival
 * instead of being quietly uncovered. Exemptions are named below, one reason
 * each.
 *
 * Two of the plugin's endpoints are declared `createAuthEndpoint.serverOnly`
 * and therefore carry no path at all: `createVerificationOTP` and
 * `getVerificationOTP`. A path matcher cannot see them, so they are gated at
 * their only call site instead, in `./otpSession`.
 */

/**
 * Under the prefix, but not about the caller's own account: the `email` in
 * these two bodies is the address being moved TO, and both sit behind
 * `sensitiveSessionMiddleware`, so they need a session already and cannot mint
 * one. Gating them would refuse a legitimate change of address rather than a
 * login.
 */
const NOT_AN_ACCOUNT_ADDRESS = new Set([
  '/email-otp/request-email-change',
  '/email-otp/change-email',
]);

/**
 * The emitting routes. An unknown address gets `200 {success:true}` from these
 * (the plugin writes the row, finds no user, deletes it again), so a refused
 * staff address answers exactly the same thing: the response tells a caller
 * nothing about whether the account exists.
 */
const SILENT_SUCCESS = new Set([
  '/email-otp/send-verification-otp',
  '/email-otp/request-password-reset',
  '/forget-password/email-otp',
]);

/**
 * What the plugin itself throws for a wrong or expired code
 * (`EMAIL_OTP_ERROR_CODES.INVALID_OTP`, which it does not export). Copied
 * verbatim so a refused address is indistinguishable from a bad code on the
 * consuming routes, the same way `disableSignUp` already makes an unknown
 * address indistinguishable from one.
 */
const INVALID_OTP = { code: 'INVALID_OTP', message: 'Invalid OTP' };

function isEmailOtpPath(path: string | undefined): boolean {
  if (!path) return false;
  return (
    path === '/sign-in/email-otp' ||
    path === '/forget-password/email-otp' ||
    path.startsWith('/email-otp/')
  );
}

export function emailOtpAudienceGate(): BetterAuthPlugin {
  return {
    id: 'jump-email-otp-audience',
    hooks: {
      before: [
        {
          matcher: (context) => isEmailOtpPath(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            const path = ctx.path;
            if (NOT_AN_ACCOUNT_ADDRESS.has(path)) return;

            const email = (ctx.body as { email?: unknown } | undefined)?.email;
            // Not our answer to give: the endpoint's own schema rejects a
            // missing or malformed address, with its own message.
            if (typeof email !== 'string' || !email) return;

            if (await resolveOtpIdentity(email)) return;

            if (SILENT_SUCCESS.has(path)) return { success: true };
            throw APIError.from('BAD_REQUEST', INVALID_OTP);
          }),
        },
      ],
    },
  };
}
