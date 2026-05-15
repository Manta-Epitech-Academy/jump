import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { prisma } from '$lib/server/db';
import {
  forcePublication,
  getActivePublication,
} from '$lib/server/services/minigameService';
import {
  forcePublicationSchema,
  gameConfigSchema,
} from '$lib/validation/minigames';

export const load: PageServerLoad = async ({ locals }) => {
  const configs = await prisma.minigameConfig.findMany({
    orderBy: { game: 'asc' },
  });

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
      level: p.level,
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
    configs,
    publications: publicationStats,
    active,
    configForm,
    forceForm,
  };
};

export const actions: Actions = {
  upsertGame: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(gameConfigSchema));
    if (!form.valid) return fail(400, { configForm: form });

    await prisma.minigameConfig.upsert({
      where: { game: form.data.game },
      create: form.data,
      update: {
        levelCount: form.data.levelCount,
        weight: form.data.weight,
        scoringType: form.data.scoringType,
        enabled: form.data.enabled,
      },
    });

    return message(form, 'Jeu enregistré.');
  },

  deleteGame: async ({ url, locals }) => {
    const game = url.searchParams.get('game');
    if (!game) return fail(400);

    const used = await prisma.minigamePublication.count({ where: { game } });
    if (used > 0) {
      return fail(400, {
        deleteError: `Impossible : ${used} publications utilisent ce jeu.`,
      });
    }
    await prisma.minigameConfig.delete({ where: { game } });
    return { success: true };
  },

  forcePublish: async ({ request, locals }) => {
    const form = await superValidate(request, zod4(forcePublicationSchema));
    if (!form.valid) return fail(400, { forceForm: form });

    const config = await prisma.minigameConfig.findUnique({
      where: { game: form.data.game },
    });
    if (!config) {
      return message(form, 'Jeu inconnu.', { status: 400 });
    }
    if (form.data.level < 1 || form.data.level > config.levelCount) {
      return message(form, `Niveau hors plage (1–${config.levelCount}).`, {
        status: 400,
      });
    }

    await forcePublication(
      form.data.game,
      form.data.level,
      locals.user?.id ?? null,
    );
    return message(form, 'Publication forcée créée.');
  },
};
