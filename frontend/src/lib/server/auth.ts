import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins/admin';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { prisma } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { sendOtpEmail, sendParentOtpEmail } from '$lib/server/otp';
import { IMPERSONATION_IDLE_WINDOW_SEC } from '$lib/domain/impersonation';
import { resolve } from '$app/paths';
import { dev } from '$app/environment';

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  baseURL: env.ORIGIN!,
  basePath: resolve('/api/auth'),

  socialProviders: {
    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID!,
      clientSecret: env.MICROSOFT_CLIENT_SECRET!,
      tenantId: env.MICROSOFT_TENANT_ID,
      scope: ['openid', 'profile', 'email', 'User.Read'],
    },
  },

  plugins: [
    admin({
      // Creation window; the same value is the idle window that
      // `slideImpersonationExpiry` extends by on activity (see hooks).
      impersonationSessionDuration: IMPERSONATION_IDLE_WINDOW_SEC,
    }),
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        const user = await prisma.bauth_user.findUnique({
          where: { email },
          select: { role: true, name: true },
        });
        if (user?.role === 'parent') {
          await sendParentOtpEmail(email, otp, user.name ?? undefined);
          return;
        }
        await sendOtpEmail(email, otp, user?.name ?? undefined);
      },
      otpLength: 6,
      expiresIn: 600,
      // Resending within the 10-min window re-sends the SAME code and refreshes
      // its expiry (until allowedAttempts is hit), instead of rotating a new one.
      // Avoids the "two emails, which code works?" confusion for students/parents.
      // Requires a retrievable OTP — works because storage is plaintext (default);
      // switching `storeOTP` to 'hashed' would silently fall back to rotate.
      resendStrategy: 'reuse',
      // Relax the plugin's per-IP override (defaults: 3 req / 60s on
      // `/sign-in/email-otp` and friends). With a stage_seconde cohort on a
      // school's NAT, the default would 429 students 4..200 in the same
      // minute regardless of correctness. Domain-aware policy lives in
      // `$lib/server/auth/rateLimiter` (email-keyed); this stays as a sane
      // per-IP backstop only.
      rateLimit: { window: 60, max: 100 },
    }),
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
  },

  // Role and profile creation are handled by the OAuth callback routes:
  // - Staff:   /oauth/callback   → sets role to 'staff', creates StaffProfile
  // - Student: /oauth/callback → sets role to 'student', creates Talent
  // - OTP:     /login           → sets role to 'student', creates Talent
  // This avoids the databaseHook guessing the flow based on email domain.

  trustedOrigins: dev
    ? [env.ORIGIN!, 'http://localhost:5173', 'http://localhost:3030']
    : [env.ORIGIN!],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
