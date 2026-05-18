import { auth } from '$lib/server/auth';
import { prisma } from '$lib/server/db';

export interface GenerateTalentOtpResult {
  otp: string;
  email: string;
  expiresInSeconds: number;
}

/**
 * Mint a fresh sign-in OTP for a talent and return it in plain text so the
 * staff can read it back to the student in person — typical scenario at a
 * stage de seconde where the student can't access their inbox during the
 * workshop.
 *
 * Uses BetterAuth's `createVerificationOTP` endpoint, which stores the OTP
 * in `bauth_verification` exactly like the regular login flow would but
 * skips the email send. The talent then enters the code on `/login` like
 * any normal OTP sign-in.
 *
 * The talent must already have a linked `bauth_user`; without one BetterAuth
 * has nothing to sign in to and the code would be useless.
 */
export async function generateTalentOtp(
  talentId: string,
): Promise<GenerateTalentOtpResult> {
  const talent = await prisma.talent.findUniqueOrThrow({
    where: { id: talentId },
    select: { id: true, user: { select: { email: true } } },
  });
  const email = talent.user?.email;
  if (!email) {
    throw new Error(
      "Le talent n'a pas de compte utilisateur lié — impossible de générer un code de connexion.",
    );
  }
  // BetterAuth's `createVerificationOTP` does NOT clear an existing row before
  // inserting (unlike `sendVerificationOTP` which handles resend). Since
  // `bauth_verification.identifier` is `@unique`, a second mint for the same
  // email/type would hit a P2002. Format mirrors `toOTPIdentifier` in
  // better-auth/plugins/email-otp/utils.mjs: `${type}-otp-${email}`.
  const identifier = `sign-in-otp-${email.toLowerCase()}`;
  await prisma.bauth_verification.deleteMany({ where: { identifier } });
  const otp = await auth.api.createVerificationOTP({
    body: { email, type: 'sign-in' },
  });
  // `expiresIn` on the emailOTP plugin (auth.ts) is 600s.
  return { otp, email, expiresInSeconds: 600 };
}
