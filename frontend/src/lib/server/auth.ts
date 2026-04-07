import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins/admin';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { prisma } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { sendOtpEmail } from '$lib/server/otp';
import { base } from '$app/paths';
import { dev } from '$app/environment';

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  baseURL: env.ORIGIN!,
  basePath: `${base}/api/auth`,

  emailAndPassword: { enabled: true },

  socialProviders: {
    microsoft: {
      clientId: env.MICROSOFT_CLIENT_ID!,
      clientSecret: env.MICROSOFT_CLIENT_SECRET!,
      tenantId: env.MICROSOFT_TENANT_ID,
    },
  },

  plugins: [
    admin({
      impersonationSessionDuration: 60 * 60,
    }),
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await sendOtpEmail(email, otp);
      },
      otpLength: 6,
      expiresIn: 600,
    }),
  ],

  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
    expiresIn: 14 * 24 * 60 * 60,
  },

  user: {
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
  // - Student: /camper/oauth/callback → sets role to 'student', creates StudentProfile
  // - OTP:     /camper/login      → sets role to 'student', creates StudentProfile
  // This avoids the databaseHook guessing the flow based on email domain.

  trustedOrigins: dev
    ? [env.ORIGIN!, 'http://localhost:5173', 'http://localhost:3030']
    : [env.ORIGIN!],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
