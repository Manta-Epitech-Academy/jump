import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { requireFlag } from '$lib/server/auth/guards';
import {
  getClosestEventForTalent,
  getLeaderboard,
} from '$lib/server/services/minigameService';
import { prisma } from '$lib/server/db';

/**
 * Leaderboard scoped by the talent's closest event (ongoing today →
 * upcoming → most recent past). Surfaces the same ranking the pédago
 * staff sees on `/staff/pedago/events/<id>/minigames`, but anchored to
 * whichever event the talent is closest to.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');
  requireFlag(locals, 'minigames');

  const closest = await getClosestEventForTalent(locals.talent.id);
  if (!closest) throw error(404, "Pas d'event rattaché à ton compte.");

  const publication = await prisma.minigamePublication.findUnique({
    where: { id: params.publicationId },
  });
  if (!publication) throw error(404, 'Publication introuvable.');

  const { rows, scoringType } = await getLeaderboard(
    params.publicationId,
    closest.eventId,
  );

  return {
    publication,
    rows,
    scoringType,
    currentTalentId: locals.talent.id,
  };
};
