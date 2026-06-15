import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  const talent = locals.talent;

  const grants = await prisma.xpGrant.findMany({
    where: { talentId: talent.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      source: true,
      sourceId: true,
      amount: true,
      note: true,
      createdAt: true,
    },
  });

  return {
    student: talent,
    grants,
  };
};
