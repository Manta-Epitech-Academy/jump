import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { requireFlag } from '$lib/server/auth/guards';
import {
  getCampusLeaderboard,
  getTalentCampusIds,
} from '$lib/server/services/minigameService';
import { prisma } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');
  requireFlag(locals, 'minigames');

  const campusIds = await getTalentCampusIds(locals.talent.id);
  if (campusIds.length === 0) throw error(404, "Pas d'event en cours.");

  const publication = await prisma.minigamePublication.findUnique({
    where: { id: params.publicationId },
  });
  if (!publication) throw error(404, 'Publication introuvable.');

  const { rows, scoringType } = await getCampusLeaderboard(
    params.publicationId,
    campusIds,
  );

  return {
    publication,
    rows,
    scoringType,
    currentTalentId: locals.talent.id,
  };
};
