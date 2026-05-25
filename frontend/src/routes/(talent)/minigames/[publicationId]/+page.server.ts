import type { Actions, PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
  checkTalentEligibility,
  mintAttempt,
} from '$lib/server/services/minigameService';

/**
 * Read-only: never mints here. `load` runs on speculative hover-preload, so a
 * mutation would burn the talent's single daily attempt before they ever click.
 * Minting happens in the `play` action below, behind an explicit submit.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.talent) throw error(401, 'Non autorisé');

  const jumpGamesUrl = env.JUMP_GAMES_URL;
  if (!jumpGamesUrl) {
    console.error('[minigames] JUMP_GAMES_URL not configured.');
    throw error(503, 'Entraînements temporairement indisponibles.');
  }

  const eligibility = await checkTalentEligibility(locals.talent.id);
  if (!eligibility.ok) {
    if (eligibility.reason === 'already_played') {
      throw redirect(303, `/minigames/${params.publicationId}/leaderboard`);
    }
    throw redirect(303, '/');
  }
  if (eligibility.publication.id !== params.publicationId) {
    // Stale link — today's publication has rotated.
    throw redirect(303, '/');
  }

  return { jumpGamesUrl, publication: eligibility.publication };
};

export const actions: Actions = {
  play: async ({ locals, params }) => {
    if (!locals.talent) throw error(401, 'Non autorisé');
    if (!env.JUMP_GAMES_URL) {
      throw error(503, 'Entraînements temporairement indisponibles.');
    }

    const result = await mintAttempt(locals.talent.id, params.publicationId);
    if (!result.ok) {
      if (result.reason === 'already_played') {
        throw redirect(303, `/minigames/${params.publicationId}/leaderboard`);
      }
      throw redirect(303, '/');
    }

    return { token: result.result.token };
  },
};
