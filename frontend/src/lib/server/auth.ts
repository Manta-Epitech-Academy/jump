import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins/admin';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { prisma } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { sendOtpEmail } from '$lib/server/otp';
import { base } from '$app/paths';
import { dev } from '$app/environment';

/** Temporary store for parent OTPs — consumed by sendParentSignatureEmail */
export const pendingParentOtps = new Map<string, string>();

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  baseURL: env.ORIGIN!,
  basePath: `${base}/api/auth`,

  emailAndPassword: {
    enabled: true,
    password: {
      hash: (password) =>
        Bun.password.hash(password, {
          algorithm: 'argon2id',
          memoryCost: 19456, // 19 MiB — OWASP minimum recommendation
          timeCost: 2,
        }),
      verify: ({ password, hash }) => Bun.password.verify(password, hash),
    },
  },

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
        const user = await prisma.bauth_user.findUnique({
          where: { email },
          select: { role: true, name: true },
        });
        // For parents, store the OTP so the caller can include it in a single combined email
        if (user?.role === 'parent') {
          pendingParentOtps.set(email, otp);
          return;
        }
        await sendOtpEmail(email, otp, user?.name ?? undefined);
      },
      otpLength: 6,
      expiresIn: 600,
    }),
  ],

  account: {
    modelName: 'bauth_account',
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
  // - Student: /camper/oauth/callback → sets role to 'student', creates StudentProfile
  // - OTP:     /camper/login      → sets role to 'student', creates StudentProfile
  // This avoids the databaseHook guessing the flow based on email domain.

  trustedOrigins: dev
    ? [env.ORIGIN!, 'http://localhost:5173', 'http://localhost:3030']
    : [env.ORIGIN!],
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
