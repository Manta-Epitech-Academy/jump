import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
  getClosestEventForTalent,
  getCampusLeaderboard,
  getUnseenMinigameRankReward,
} from '$lib/server/services/minigameService';
import { prisma } from '$lib/server/db';

/**
 * Talent-facing leaderboard scoped to the talent's campus — derived from their
 * closest event (ongoing today → upcoming → most recent past). Falls back to a
 * global ranking when the talent has no participations (hence no campus).
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  const closest = await getClosestEventForTalent(locals.talent.id);
  const campusId = closest?.campusId ?? null;

  const publication = await prisma.minigamePublication.findUnique({
    where: { id: params.publicationId },
  });
  if (!publication) throw error(404, 'Publication introuvable.');

  const campus = campusId
    ? await prisma.campus.findUnique({
        where: { id: campusId },
        select: { name: true },
      })
    : null;

  const { rows, scoringType } = await getCampusLeaderboard(
    params.publicationId,
    campusId,
  );

  // If the player just earned a rank bonus and hasn't seen its float yet, it
  // plays here too (not only on the dashboard) so the celebration lands on
  // whichever page they open first after a game.
  const minigameRankReward = await getUnseenMinigameRankReward(
    locals.talent.id,
  );

  return {
    publication,
    rows,
    scoringType,
    currentTalentId: locals.talent.id,
    campusName: campus?.name ?? null,
    minigameRankReward,
  };
};
