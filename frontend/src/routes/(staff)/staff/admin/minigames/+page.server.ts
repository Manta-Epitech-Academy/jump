import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import { recordUsage } from '$lib/server/usage/record';
import { USAGE_FEATURES } from '$lib/domain/usage';
import {
  forcePublication,
  getActivePublication,
} from '$lib/server/services/minigameService';
import {
  getGameCatalog,
  getCatalogGame,
  scoringTypeFor,
  type CatalogGame,
} from '$lib/server/services/minigameCatalog';
import {
  forcePublicationSchema,
  gameConfigSchema,
} from '$lib/validation/minigames';

/** A catalogue game merged with its host-side rotation curation. */
export interface AdminGame extends CatalogGame {
  scoringType: 'score' | 'chrono';
  enabled: boolean;
  weight: number;
  /** A config row exists for this game (it has been curated at least once). */
  curated: boolean;
}

export const load: PageServerLoad = async () => {
  const [catalog, configs] = await Promise.all([
    getGameCatalog(),
    prisma.minigameConfig.findMany(),
  ]);
  const configByGame = new Map(configs.map((c) => [c.game, c]));

  const games: AdminGame[] = catalog
    .map((g) => {
      const cfg = configByGame.get(g.name);
      return {
        ...g,
        scoringType: scoringTypeFor(g),
        enabled: cfg?.enabled ?? false,
        weight: cfg?.weight ?? 1,
        curated: !!cfg,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));

  // Config rows whose slug is no longer in the catalogue (game removed from
  // jump-games). They can't rotate; surface them so an admin can clean up.
  // Only meaningful when the catalogue actually loaded: an unreachable
  // jump-games yields an empty catalogue, which must not be misread as "every
  // game was removed" — that would invite deleting live rotation config during
  // a transient outage.
  const catalogAvailable = catalog.length > 0;
  const catalogNames = new Set(catalog.map((g) => g.name));
  const orphans = catalogAvailable
    ? configs
        .filter((c) => !catalogNames.has(c.game))
        .map((c) => ({ game: c.game, enabled: c.enabled, weight: c.weight }))
    : [];

  const publications = await prisma.minigamePublication.findMany({
    orderBy: { publishedAt: 'desc' },
    take: 50,
    include: {
      attempts: {
        select: { score: true, chrono: true, status: true, valid: true },
      },
    },
  });

  const publicationStats = publications.map((p) => {
    const done = p.attempts.filter((a) => a.status === 'done' && a.valid);
    const count = done.length;
    const avgScore =
      count > 0
        ? done.reduce((acc, a) => acc + (a.score ?? 0), 0) / count
        : null;
    const chronos = done.map((a) => a.chrono ?? 0).filter((c) => c > 0);
    const avgChrono =
      chronos.length > 0
        ? chronos.reduce((a, b) => a + b, 0) / chronos.length
        : null;
    return {
      id: p.id,
      game: p.game,
      gameName: p.gameName,
      level: p.level,
      scoringType: p.scoringType,
      publishedAt: p.publishedAt,
      forcedById: p.forcedById,
      attemptsCount: count,
      avgScore,
      avgChrono,
    };
  });

  const active = await getActivePublication();

  const configForm = await superValidate(zod4(gameConfigSchema));
  const forceForm = await superValidate(zod4(forcePublicationSchema));

  return {
    games,
    orphans,
    catalogAvailable,
    publications: publicationStats,
    active,
    configForm,
    forceForm,
  };
};

export const actions: Actions = {
  // Curate rotation for a single catalogue game: on/off + weight.
  saveGame: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_MINIGAME_WRITE, { locals });
    const form = await superValidate(request, zod4(gameConfigSchema));
    if (!form.valid) return fail(400, { configForm: form });

    const game = await getCatalogGame(form.data.game);
    if (!game) {
      return message(form, 'Jeu absent du catalogue.', { status: 400 });
    }

    await prisma.minigameConfig.upsert({
      where: { game: form.data.game },
      create: {
        game: form.data.game,
        weight: form.data.weight,
        enabled: form.data.enabled,
      },
      update: { weight: form.data.weight, enabled: form.data.enabled },
    });

    return message(form, 'Jeu enregistré.');
  },

  // Remove a stale config row (only ever an orphan — catalogue games are
  // toggled off, not deleted). Publications are self-contained, so this is
  // always safe.
  removeGame: async ({ url, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_MINIGAME_WRITE, { locals });
    const game = url.searchParams.get('game');
    if (!game) return fail(400);
    await prisma.minigameConfig.deleteMany({ where: { game } });
    return { success: true };
  },

  forcePublish: async ({ request, locals }) => {
    recordUsage(USAGE_FEATURES.ADMIN_MINIGAME_WRITE, { locals });
    const form = await superValidate(request, zod4(forcePublicationSchema));
    if (!form.valid) return fail(400, { forceForm: form });

    const game = await getCatalogGame(form.data.game);
    if (!game) {
      return message(form, 'Jeu absent du catalogue.', { status: 400 });
    }
    if (form.data.level < 1 || form.data.level > game.levelCount) {
      return message(form, `Niveau hors plage (1–${game.levelCount}).`, {
        status: 400,
      });
    }

    await forcePublication({
      game: game.name,
      gameName: game.displayName,
      level: form.data.level,
      scoringType: scoringTypeFor(game),
      forcedById: locals.user?.id ?? null,
    });
    return message(form, 'Publication forcée créée.');
  },
};
