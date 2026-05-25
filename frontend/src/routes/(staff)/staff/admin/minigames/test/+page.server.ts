import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { mintGameJwt } from '$lib/server/jwt';
import { getCatalogGame } from '$lib/server/services/minigameCatalog';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw error(401, 'Non autorisé');
  // Defense-in-depth: this page mints signed JWTs (mintGameJwt) accepted
  // by the external jump-games service. Even though `/staff/admin/*` is
  // gated to admin at the URL layer, re-check here so this load never
  // hands out tokens to a non-admin if the gate is bypassed or refactored.
  if (locals.staffProfile?.staffRole !== 'admin') {
    throw error(403, 'Réservé aux administrateurs');
  }

  const game = url.searchParams.get('game');
  const levelParam = url.searchParams.get('level');
  if (!game || !levelParam) throw error(400, 'Paramètres manquants.');
  const level = Number(levelParam);
  if (!Number.isInteger(level) || level < 1) {
    throw error(400, 'Niveau invalide.');
  }

  const catalogGame = await getCatalogGame(game);
  if (!catalogGame) throw error(404, 'Jeu inconnu.');
  if (level > catalogGame.levelCount) {
    throw error(400, `Niveau hors plage (1–${catalogGame.levelCount}).`);
  }

  const jumpGamesUrl = env.JUMP_GAMES_URL;
  if (!jumpGamesUrl) throw error(503, 'JUMP_GAMES_URL non configuré.');

  const playerId = `admin-test-${locals.user.id}`;
  const { token } = await mintGameJwt(playerId, game, level);

  return {
    token,
    jumpGamesUrl,
    game,
    gameName: catalogGame.displayName,
    level,
  };
};
