import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
  resolveLeaderboardScope,
  getCampusLeaderboard,
} from '#lib/server/services/minigameService.ts';
import { prisma } from '#lib/server/db.ts';
import { loadPendingCelebrations } from '#lib/server/talent/celebrations.ts';

/**
 * Talent-facing leaderboard, scoped to the board the viewer was ranked on: the
 * campus stamped on their own attempt once they've played (so the board they see
 * matches the board their rank bonus was paid on), or a preview from their
 * closest event before they've played. Null scope ⇒ a global ranking.
 */
export const load: PageServerLoad = async ({ locals, params, cookies }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  const { campusId, viewerOutcome } = await resolveLeaderboardScope(
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
    locals.talent.id,
  );

  // A rank bonus is granted when the game finishes, after the play page has
  // celebrated the win: it plays here too, not only on the dashboard, so it
  // lands on whichever page the player opens first after a game, with
  // anything else still owed.
  const celebrations = await loadPendingCelebrations(locals.talent, cookies);

  return {
    publication,
    rows,
    scoringType,
    campusName: campus?.name ?? null,
    viewerOutcome,
    celebrations,
  };
};
