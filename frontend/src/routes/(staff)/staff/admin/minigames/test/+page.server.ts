import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { prisma } from '$lib/server/db';
import { mintGameJwt } from '$lib/server/jwt';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) throw error(401, 'Non autorisé');

  const game = url.searchParams.get('game');
  const levelParam = url.searchParams.get('level');
  if (!game || !levelParam) throw error(400, 'Paramètres manquants.');
  const level = Number(levelParam);
  if (!Number.isInteger(level) || level < 1) {
    throw error(400, 'Niveau invalide.');
  }

  const config = await prisma.minigameConfig.findUnique({ where: { game } });
  if (!config) throw error(404, 'Jeu inconnu.');

  const jumpGamesUrl = env.JUMP_GAMES_URL;
  if (!jumpGamesUrl) throw error(503, 'JUMP_GAMES_URL non configuré.');

  const playerId = `admin-test-${locals.user.id}`;
  const { token } = await mintGameJwt(playerId, game, level);

  return { token, jumpGamesUrl, game, level };
};
