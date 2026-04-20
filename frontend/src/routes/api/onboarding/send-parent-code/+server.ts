import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { sendParentSignatureEmail } from '$lib/server/services/parentEmail';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const profile = locals.talent;

  if (!profile.parentEmail) {
    throw error(400, 'Aucun email parent renseigné');
  }

  // Send OTP via BetterAuth
  await auth.api.sendVerificationOTP({
    body: { email: profile.parentEmail, type: 'sign-up' },
  });

  // Send parent email with link
  await sendParentSignatureEmail(
    profile.parentEmail,
    profile.id,
    `${profile.prenom} ${profile.nom}`,
  );

  return json({ success: true });
};
