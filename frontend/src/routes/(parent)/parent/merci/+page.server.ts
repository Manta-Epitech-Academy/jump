import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolve } from '$app/paths';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'parent') {
    throw error(401, 'Non autorisé');
  }

  // If there are still unsigned children, send back to signature
  const unsignedCount = await prisma.talent.count({
    where: {
      parentEmail: locals.user.email,
      imageRightsSignedAt: null,
    },
  });

  if (unsignedCount > 0) {
    throw redirect(303, resolve('/parent/signature'));
  }

  // Get the most recently signed child + their campus info
  const child = await prisma.talent.findFirst({
    where: { parentEmail: locals.user.email },
    orderBy: { imageRightsSignedAt: 'desc' },
    select: { prenom: true, id: true },
  });

  if (!child) {
    throw redirect(303, resolve('/parent/login'));
  }

  // Find the campus via the child's participation
  const participation = await prisma.participation.findFirst({
    where: { talentId: child.id },
    orderBy: { event: { date: 'desc' } },
    select: {
      event: {
        select: {
          campus: {
            select: { name: true, contactEmail: true },
          },
        },
      },
    },
  });

  const campus = participation?.event?.campus;

  return {
    childPrenom: child.prenom,
    campusName: campus?.name ?? '',
    contactEmail: campus?.contactEmail ?? '',
  };
};
