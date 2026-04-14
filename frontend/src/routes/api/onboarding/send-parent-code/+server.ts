import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createParentCode } from '$lib/server/services/parentCodeService';
import { sendParentSignatureEmail } from '$lib/server/services/parentEmail';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.studentProfile) {
    throw error(401, 'Non autorisé');
  }

  const profile = locals.studentProfile;

  if (!profile.parentEmail) {
    throw error(400, 'Aucun email parent renseigné');
  }

  const code = await createParentCode(profile.id);

  await sendParentSignatureEmail(
    profile.parentEmail,
    code,
    `${profile.prenom} ${profile.nom}`,
  );

  return json({ success: true });
};
