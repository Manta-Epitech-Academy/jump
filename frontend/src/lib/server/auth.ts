import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins/admin';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { prisma } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { sendOtpEmail, sendParentOtpEmail } from '$lib/server/otp';
import { resolve } from '$app/paths';
import { dev } from '$app/environment';
import { calendarSyncMode } from '$lib/server/services/calendarSync/config';

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  baseURL: env.ORIGIN!,
  basePath: resolve('/api/auth'),

  socialProviders: {
    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID!,
      clientSecret: env.MICROSOFT_CLIENT_SECRET!,
      tenantId: env.MICROSOFT_TENANT_ID,
      // `Calendars.ReadWrite` is only requested when the calendar sync
      // backend is `graph` — see `calendarSync/config.ts`. Tenants that
      // gate that scope behind admin consent (Epitech-style) can flip
      // `INTERVIEW_SYNC_MODE=email` and the consent screen disappears,
      // because the email backend doesn't need the scope at all.
      // Sourced from `calendarSyncMode` (not env directly) so the
      // documented default — env unset → email mode — actually skips
      // the consent prompt instead of accidentally requesting it.
      scope: [
        'openid',
        'profile',
        'email',
        'User.Read',
        ...(calendarSyncMode === 'graph'
          ? ['Calendars.ReadWrite', 'offline_access']
          : []),
      ],
    },
  },

  plugins: [
    admin({
      impersonationSessionDuration: 60 * 60,
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
