import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { sendParentSignatureEmail } from '$lib/server/services/parentEmail';
import { consumeParentOtp } from '$lib/server/services/parentTokens';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const profile = locals.talent;

  if (!profile.parentEmail) {
    throw error(400, 'Aucun email parent renseigné');
  }

  // Send OTP via BetterAuth (stores in parentToken table for parent role)
  await auth.api.sendVerificationOTP({
    body: { email: profile.parentEmail, type: 'email-verification' },
  });

  // Consume OTP from DB and send combined email with link + code
  const otp = await consumeParentOtp(profile.parentEmail);
  await sendParentSignatureEmail(
    profile.parentEmail,
    profile.id,
    `${profile.prenom} ${profile.nom}`,
    otp ?? undefined,
  );

  return json({ success: true });
};
