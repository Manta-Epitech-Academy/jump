import { randomUUID } from 'node:crypto';
import { createAuthMiddleware } from 'better-auth/api';
import type { BetterAuthPlugin } from 'better-auth';
import { resolveOtpDoor } from './otpAudience';

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
 * leave a live code behind under the refused address. A `before` hook runs
 * ahead of the handler - and it covers `auth.api.*` calls as well as HTTP
 * requests, since both reach the endpoint through the same dispatcher.
 *
 * **The refusal is a substitution, not an answer of our own.** A refused
 * address is handed to BetterAuth as an address BetterAuth has never seen, and
 * the plugin's own unknown-address path produces the response: `200
 * {success:true}` on the emitting routes (it writes a row under the substitute,
 * finds no user, deletes it again), `INVALID_OTP` on the consuming ones. So
 * "indistinguishable from an unknown address" holds because it IS the unknown
 * address path, not because we reproduce what it returns.
 *
 * That distinction is the whole reason this is shaped as a substitution.
 * Answering `200 {success:true}` ourselves also has to answer for every
 * request the endpoint would have rejected BEFORE reaching its user lookup,
 * and a `before` hook runs ahead of body validation: `{email}` with no `type`,
 * or `type: 'change-email'`, is a 400 from the endpoint's own schema for an
 * eligible address and would have been a 200 from us for every other one -
 * which discloses, on an unauthenticated route, exactly the bit the silent
 * success exists to hide. Substituting leaves all of that where it belongs.
 *
 * **Default-deny over the plugin's paths.** The matcher takes every path
 * carrying `email-otp` rather than listing today's nine routes, so an endpoint
 * added by a future `better-auth` release is covered on arrival, inside the
 * `/email-otp/` prefix or beside it (`/sign-in/email-otp` and
 * `/forget-password/email-otp` are already outside it). Substituting is safe to
 * apply blind in a way that answering never was: a route we have not read
 * cannot do more for the substitute than it does for any unknown address.
 *
 * Two of the plugin's endpoints are declared `createAuthEndpoint.serverOnly`
 * and therefore carry no path at all: `createVerificationOTP` and
 * `getVerificationOTP`. A path matcher cannot see them, so the one Jump calls
 * is gated at its call site instead, in `./otpSession`.
 *
 * Rests on `disableSignUp: true` (set beside the plugin, and load-bearing in
 * its own right): it is what stops `/sign-in/email-otp` from creating an
 * account for the substitute address instead of refusing the code.
 */

/**
 * The address a refused caller is presented to BetterAuth as.
 *
 * `.invalid` is reserved by RFC 6761 and can never be registered, and the
 * random component means the row cannot pre-exist even by accident, so
 * `findUserByEmail` misses it by construction rather than by convention. One
 * per request: nothing is ever stored against it that outlives the call.
 */
function noSuchAccountAddress(): string {
  return `otp-door-refused.${randomUUID()}@example.invalid`;
}

export function emailOtpAudienceGate(): BetterAuthPlugin {
  return {
    id: 'jump-email-otp-audience',
    hooks: {
      before: [
        {
          matcher: (context) => (context.path ?? '').includes('email-otp'),
          handler: createAuthMiddleware(async (ctx) => {
            // No login address in the body, so nothing to place this caller
            // with: the two email-change routes are the case that reaches here
            // (they carry `newEmail`, the address being moved TO, and sit
            // behind `sensitiveSessionMiddleware`, so they need a session
            // already and cannot mint one), and so is any malformed body,
            // which the endpoint's own schema answers for.
            const body = ctx.body as Record<string, unknown> | undefined;
            if (typeof body?.email !== 'string') return;

            // `unknown` is left alone deliberately: the plugin's answer for an
            // address it does not know is the one we want, and it is already
            // the one it gives.
            const door = await resolveOtpDoor(body.email);
            if (door.verdict !== 'refused') return;

            return {
              context: { body: { ...body, email: noSuchAccountAddress() } },
            };
          }),
        },
      ],
    },
  };
}
