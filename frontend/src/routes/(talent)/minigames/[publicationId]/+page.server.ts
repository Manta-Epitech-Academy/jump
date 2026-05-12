import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { requireFlag } from '$lib/server/auth/guards';
import { mintAttempt } from '$lib/server/services/minigameService';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');
  requireFlag(locals, 'minigames');

  const jumpGamesUrl = env.JUMP_GAMES_URL;
  if (!jumpGamesUrl) {
    console.error('[minigames] JUMP_GAMES_URL not configured.');
    throw error(503, 'Mini-jeux temporairement indisponibles.');
  }

  const result = await mintAttempt(locals.talent.id, params.publicationId);
  if (!result.ok) {
    if (result.reason === 'already_played') {
      throw redirect(303, `/minigames/${params.publicationId}/leaderboard`);
    }
    throw redirect(303, '/');
  }

  return {
    token: result.result.token,
    jumpGamesUrl,
    publication: result.result.publication,
  };
};
