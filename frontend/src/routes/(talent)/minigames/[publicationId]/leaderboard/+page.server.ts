import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
  resolveLeaderboardScope,
  getCampusLeaderboard,
  getUnseenMinigameRankReward,
} from '$lib/server/services/minigameService';
import { prisma } from '$lib/server/db';

/**
 * Talent-facing leaderboard, scoped to the board the viewer was ranked on: the
 * campus stamped on their own attempt once they've played (so the board they see
 * matches the board their rank bonus was paid on), or a preview from their
 * closest event before they've played. Null scope ⇒ a global ranking.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  const { campusId } = await resolveLeaderboardScope(
    locals.talent.id,
    params.publicationId,
  );

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
