import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  // The XP total is read from the layout's `data.talent`; this load only owns
  // the ledger rows for the timeline. Selecting just the display fields keeps
  // the staff-facing `XpGrant.note` off the wire (it is unowned, talent-facing
  // copy has not been decided, and no source writes it yet).
  const grants = await prisma.xpGrant.findMany({
    where: { talentId: locals.talent.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      source: true,
      amount: true,
      createdAt: true,
    },
  });

  return { grants };
};
