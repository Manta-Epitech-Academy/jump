import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.studentProfile) {
    throw error(401, 'Non autorisé');
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { id: locals.studentProfile.id },
    select: { imageRightsSignedAt: true },
  });

  return json({ signed: !!profile?.imageRightsSignedAt });
};
