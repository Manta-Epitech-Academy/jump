import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  // Find the first child with anything still pending (règlement unsigned or
  // image rights undecided) to personalize the welcome message. If every child
  // is fully settled, skip straight to the thank-you page.
  const child = await prisma.talent.findFirst({
    where: {
      parentEmail: locals.user.email,
      OR: [{ parentRulesSignedAt: null }, { imageRightsDecidedAt: null }],
    },
    select: { prenom: true },
  });

  if (!child) {
    throw redirect(303, resolve('/parent/merci'));
  }

  return { childPrenom: child.prenom };
};
