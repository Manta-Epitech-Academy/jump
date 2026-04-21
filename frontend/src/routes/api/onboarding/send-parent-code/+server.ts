import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const profile = locals.talent;

  if (!profile.parentEmail) {
    throw error(400, 'Aucun email parent renseigné');
  }

  // BetterAuth generates OTP and sends email directly via hook
  await auth.api.sendVerificationOTP({
    body: { email: profile.parentEmail, type: 'sign-in' },
  });

  return json({ success: true });
};
