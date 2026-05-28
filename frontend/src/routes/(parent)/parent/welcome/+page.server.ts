import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  // Find the first child still awaiting a decision to personalize the welcome
  // message. If every child has a settled decision (authorized *or* refused),
  // skip to the thank-you page.
  const child = await prisma.talent.findFirst({
    where: {
      parentEmail: locals.user.email,
      imageRightsDecidedAt: null,
    },
    select: { prenom: true },
  });

  if (!child) {
    throw redirect(303, resolve('/parent/merci'));
  }

  return { childPrenom: child.prenom };
};
