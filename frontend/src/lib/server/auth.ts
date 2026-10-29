import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins/admin';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { prisma } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { sendOtpEmail, sendParentOtpEmail } from '$lib/server/otp';
import { resolveOtpIdentity } from '$lib/server/auth/otpAudience';
import { emailOtpAudienceGate } from '$lib/server/auth/emailOtpAudienceGate';
import { staffDoorGate } from '$lib/server/auth/staffDoor';
import { httpSurface } from '$lib/server/auth/httpSurface';
import { pinnedMicrosoftTenant } from '$lib/server/auth/microsoftTenant';
import { IMPERSONATION_IDLE_WINDOW_SEC } from '$lib/domain/impersonation';
import { resolve } from '$app/paths';
import { building, dev } from '$app/environment';

// Microsoft provider overrides, and only those: the one thing an integration
// test needs to change is where the provider's token/authorize endpoints
// point (a local fake HTTP server standing in for login.microsoftonline.com),
// so it can drive the real BetterAuth callback code path instead of writing
// to `bauth_account` by hand. Everything else (adapter, plugins, account/
// session/user config) stays identical between the production singleton and
// a test instance, on purpose: duplicating that config in a test file is
// exactly the kind of drift #296 was.
type MicrosoftProviderOverrides = {
  authority?: string;
  disableProfilePhoto?: boolean;
};

export function createAuthOptions(
  microsoftOverrides: MicrosoftProviderOverrides = {},
) {
  const emailOtp = emailOTP({
    async sendVerificationOTP({ email, otp }) {
      // Same resolver the gate below refuses on, so the template a
      // recipient gets and the door they are allowed through are one
      // decision. The `null` branch is exhaustiveness rather than a second
      // gate: the gate makes this callback unreachable for an address it
      // refused, and a silent fall-through to the talent template is
      // exactly how a staff address used to receive the
      // « futur·e codeur·se » mail.
      const identity = await resolveOtpIdentity(email);
      if (!identity) {
        throw new Error(
          'sendVerificationOTP called for an address that is neither a talent nor a legal guardian',
        );
      }
      if (identity.audience === 'parent') {
        await sendParentOtpEmail(email, otp, identity.name ?? undefined);
        return;
      }
      await sendOtpEmail(email, otp, identity.name ?? undefined);
    },
    // Never auto-create an account for an unknown email. Talent and parent
    // accounts are provisioned upstream (SF sync / CSV import / onboarding);
    // a login is only ever a sign-IN against an existing `bauth_user`. Without
    // this, emailOTP defaults to sign-up-enabled, so any path that minted an
    // OTP for an unminted email would silently create an orphan account.
    // Defence in depth on top of the login route's 404 on an unknown email.
    disableSignUp: true,
    otpLength: 6,
    expiresIn: 600,
    // Resending within the 10-min window re-sends the SAME code and refreshes
    // its expiry (until allowedAttempts is hit), instead of rotating a new one.
    // Avoids the "two emails, which code works?" confusion for students/parents.
    // Requires a retrievable OTP: works because storage is plaintext (default);
    // switching `storeOTP` to 'hashed' would silently fall back to rotate.
    resendStrategy: 'reuse',
  });

  const adminPlugin = admin({
    // Creation window; the same value is the idle window that
    // `slideImpersonationExpiry` extends by on activity (see hooks).
    impersonationSessionDuration: IMPERSONATION_IDLE_WINDOW_SEC,
  });

  return {
    database: prismaAdapter(prisma, { provider: 'postgresql' }),

    baseURL: env.ORIGIN!,
    basePath: resolve('/api/auth'),

    socialProviders: {
      microsoft: {
        clientId: env.MICROSOFT_CLIENT_ID!,
        clientSecret: env.MICROSOFT_CLIENT_SECRET!,
        // Refuses to boot unless pinned to one directory, which is what lets
        // the address below be trusted (see the module). Not while `building`:
        // `vite build` evaluates this module with no runtime env, and the
        // instance it builds never serves.
        tenantId: building
          ? undefined
          : pinnedMicrosoftTenant(env.MICROSOFT_TENANT_ID),
        // These four and nothing else. The provider's defaults add
        // `offline_access`, which makes Microsoft issue a refresh token, stored
        // in `bauth_account` and outliving any session it was read through.
        // Jump never refreshes: `syncMicrosoftAvatar` reads the access token
        // once, right after sign-in.
        disableDefaultScope: true,
        scope: ['openid', 'profile', 'email', 'User.Read'],
        // Jump signs staff in through the redirect, never with an ID token a
        // caller posts (`sign-in/social` with `idToken`), which would admit a
        // token minted for another session. `httpSurface` refuses that body
        // over HTTP too; this closes the flow itself.
        disableIdTokenSignIn: true,
        // Entra ID emits no `email_verified` claim unless it is declared as an
        // optional claim on the app registration, so BetterAuth defaults the
        // profile to unverified and stamps `bauth_user.emailVerified = false`
        // on every staff account it creates. Exactly one thing reads that
        // column: BetterAuth's own account-linking test
        // (`accountLinking.requireLocalEmailVerified`, default true). A `false`
        // there refuses the sign-in with `account_not_linked` the day that
        // account's `bauth_account` row is gone, which is what happened to 134
        // of 139 staff profiles. The incident, and why the fix is not to switch
        // that option off, are in
        // `prisma/migrations/20260915140000_verify_staff_emails_for_oauth_relink`.
        //
        // Declared here rather than repaired afterwards: reaching this callback
        // means the directory `MICROSOFT_TENANT_ID` pins authenticated the
        // address, and the staff door (`validateUserInfo` below) refuses
        // anything outside `@epitech.eu` on top. Within that pair the address IS
        // verified, and saying so at creation is what keeps the migration's
        // invariant true for every account created from here on, instead of
        // leaving it to the next repair.
        //
        // What it does NOT do is decide who may come through this door, and the
        // tempting reading is the opposite one, so it is worth stating. A
        // guardian's row is written `emailVerified: true` by
        // `setParentLogin`, and a talent's is
        // promoted to `true` by BetterAuth the first time they use the OTP door,
        // so the account-link test admits both long before this line existed.
        // What keeps their account out of the staff space, and intact, is
        // `auth/staffDoor.ts`, through `validateUserInfo` below.
        mapProfileToUser: () => ({ emailVerified: true }),
        ...microsoftOverrides,
      },
    },

    plugins: [
      // Over HTTP, BetterAuth answers the staff door's two routes and nothing
      // else: every other flow, both plugins below included, runs through
      // `auth.api.*`. The reasoning, and the doors the rest used to open, are
      // in the module.
      httpSurface(),
      adminPlugin,
      emailOtp,
      // Closes the plugin above to staff accounts on every `auth.api.*` call
      // (its HTTP routes are not mounted, see `httpSurface`). Registered
      // here rather than as a top-level `hooks.before` so the guard travels
      // with the door it guards; the reasoning, and why it cannot live in
      // `sendVerificationOTP`, is in the module.
      emailOtpAudienceGate(),
    ],

    account: {
      modelName: 'bauth_account',
      accountLinking: {
        enabled: true,
        trustedProviders: ['microsoft'],
      },
    },

    verification: {
      modelName: 'bauth_verification',
    },

    session: {
      modelName: 'bauth_session',
      cookieCache: { enabled: true, maxAge: 5 * 60 },
      expiresIn: 14 * 24 * 60 * 60,
    },

    user: {
      modelName: 'bauth_user',
      additionalFields: {
        role: {
          type: 'string' as const,
          defaultValue: 'user',
          input: false,
        },
      },
      // The staff door: who the Microsoft provider may create, link or sign
      // in, asked by BetterAuth before each of those writes, so it holds
      // whatever `callbackURL` the client named. The rule, and why it cannot
      // live in `staff/oauth/callback`, is in the module.
      validateUserInfo: staffDoorGate,
    },

    // Role and profile creation are handled by the sign-in routes:
    // - Staff:   /staff/oauth/callback → sets role to 'staff', creates StaffProfile
    //            (who may get that far is the staff door above, not the route)
    // - OTP:     /login                → sets role to 'student', creates Talent
    // This avoids the databaseHook guessing the flow based on email domain.

    // Where a refusal raised INSIDE BetterAuth lands. Without it the default is
    // `/api/auth/error`, BetterAuth's own page, in English, printing its code
    // (`account_not_linked`) verbatim at a member of staff. The code travels as
    // `?error=`, which `/staff/login`'s load turns into French.
    //
    // Set here rather than as `errorCallbackURL` on the `signIn.social` call,
    // and the difference is what is covered rather than what is typed: this is
    // part of `createAuthOptions`, which the integration suite drives whole, so
    // dropping it fails a test instead of quietly restoring the English page. It
    // also catches the paths that never see a per-flow value, `/api/auth/error`
    // itself included.
    //
    // `/staff/login` is the right destination for every one of them only because
    // the staff door is the only OAuth door: talents sign in by OTP. Adding a
    // talent OAuth door means giving this a second answer.
    onAPIError: { errorURL: resolve('/staff/login') },

    trustedOrigins: dev
      ? [env.ORIGIN!, 'http://localhost:5173', 'http://localhost:3030']
      : [env.ORIGIN!],
  };
}

export const auth = betterAuth(createAuthOptions());

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
