import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { resolveRewardNames } from '$lib/server/services/xpStoryService';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.talent) {
    throw error(401, 'Non autorisé');
  }

  // The XP total is read from the layout's `data.talent`; this load only owns
  // the ledger rows for the timeline. Selecting just the display fields keeps
  // the staff-facing `XpGrant.note` off the wire (it is unowned, talent-facing
  // copy has not been decided, and no source writes it yet). `sourceId` is read
  // only to resolve reward names below and is dropped before it leaves the load.
  const grants = await prisma.xpGrant.findMany({
    where: { talentId: locals.talent.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      source: true,
      amount: true,
      sourceId: true,
      createdAt: true,
    },
  });

  // A `reward` grant carries its activity name on the XpReward, not the grant;
  // without this it falls to the generic fallback label on the timeline.
  const rewardNames = await resolveRewardNames(locals.talent.id, grants);

  return {
    grants: grants.map(({ sourceId, ...g }) => ({
      ...g,
      rewardName: sourceId ? (rewardNames.get(sourceId) ?? null) : null,
    })),
  };
};
