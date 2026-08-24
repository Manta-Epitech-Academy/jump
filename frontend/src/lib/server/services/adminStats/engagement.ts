/**
 * How much the cohort actually uses Jump once they are in it.
 *
 * Three angles that only mean something together: XP earned (the platform's own
 * measure of activity), minigames played (the recurring habit XP mostly comes
 * from), and which games are in rotation (without which the attempt counts are
 * unreadable, since a game nobody plays may simply never have been published).
 *
 * XP tiers are read from `domain/xp`, so the bands here are the bands the app
 * uses. The tier names are deliberately not translated or dressed up: they are
 * internal vocabulary, never shown to a talent, and this operation is core-team
 * only.
 */

import { prisma } from '$lib/server/db';
import { JUMP_LEVELS, xpRangeForLevel } from '$lib/domain/xp';
import {
  metric,
  share,
  median,
  type Metric,
} from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { cohortWhere, scopeLabels } from './cohort';

export type LevelRow = {
  level: string;
  minXp: number;
  maxXp: number | null;
  talents: number;
  share: number | null;
};

export type GameRow = {
  game: string;
  enabled: boolean;
  weight: number;
  attempts: number;
  /** Share of the périmètre's attempts played on this game. */
  share: number | null;
};

export type Engagement = {
  filters: { schoolYear: string; campus: string; event: string };
  cohort: Metric;
  withXp: Metric;
  withXpShare: Metric<number | null>;
  medianXp: Metric<number | null>;
  byLevel: Metric<LevelRow[]>;
  attempts: Metric;
  finishedAttempts: Metric;
  finishedShare: Metric<number | null>;
  players: Metric;
  playersShare: Metric<number | null>;
  games: Metric<GameRow[]>;
};

export async function getEngagement(scope: Scope = {}): Promise<Engagement> {
  const where = await cohortWhere(scope);

  const [cohort, xpRows, levelCounts, attemptsByGame, players, rotation] =
    await Promise.all([
      prisma.talent.count({ where }),
      prisma.talent.findMany({
        where: { AND: [where, { xp: { gt: 0 } }] },
        select: { xp: true },
        orderBy: { xp: 'asc' },
      }),
      Promise.all(
        JUMP_LEVELS.map(async (level) => {
          const range = xpRangeForLevel(level);
          return {
            level,
            range,
            count: await prisma.talent.count({
              where: {
                AND: [
                  where,
                  {
                    xp: {
                      gte: range.min,
                      ...(range.maxExclusive != null
                        ? { lt: range.maxExclusive }
                        : {}),
                    },
                  },
                ],
              },
            }),
          };
        }),
      ),
      prisma.minigameAttempt.groupBy({
        by: ['status'],
        where: { talent: where },
        _count: { _all: true },
      }),
      prisma.minigameAttempt
        .groupBy({ by: ['talentId'], where: { talent: where } })
        .then((rows) => rows.length),
      prisma.minigameConfig.findMany({
        orderBy: [{ enabled: 'desc' }, { game: 'asc' }],
        select: { game: true, enabled: true, weight: true },
      }),
    ]);

  const attempts = attemptsByGame.reduce((sum, g) => sum + g._count._all, 0);
  const finished =
    attemptsByGame.find((g) => g.status === 'done')?._count._all ?? 0;

  // Per-game attempt counts, keyed by the publication's game slug. Done in one
  // extra groupBy rather than a join per game: the rotation is a handful of rows.
  const perGame = await prisma.minigameAttempt.groupBy({
    by: ['publicationId'],
    where: { talent: where },
    _count: { _all: true },
  });
  const publications = perGame.length
    ? await prisma.minigamePublication.findMany({
        where: { id: { in: perGame.map((p) => p.publicationId) } },
        select: { id: true, game: true },
      })
    : [];
  const gameByPublication = new Map(publications.map((p) => [p.id, p.game]));
  const attemptsPerGame = new Map<string, number>();
  for (const row of perGame) {
    const game = gameByPublication.get(row.publicationId);
    if (!game) continue;
    attemptsPerGame.set(
      game,
      (attemptsPerGame.get(game) ?? 0) + row._count._all,
    );
  }

  return {
    filters: scopeLabels(scope),
    cohort: metric(
      cohort,
      "Talents du périmètre. Sert de dénominateur aux pourcentages d'engagement ci-dessous.",
    ),
    withXp: metric(
      xpRows.length,
      "Talents ayant gagné au moins un point d'expérience. Les XP s'obtiennent en terminant son inscription, en participant aux événements et en jouant aux mini-jeux.",
    ),
    withXpShare: metric(
      share(xpRows.length, cohort),
      "Part du périmètre ayant gagné au moins un point d'expérience, en pourcentage.",
    ),
    medianXp: metric(
      median(xpRows.map((row) => row.xp)),
      "XP médians parmi les talents qui en ont gagné au moins un. La médiane plutôt que la moyenne : quelques joueurs très assidus tireraient la moyenne loin du cas courant. Vaut null si personne n'en a gagné.",
    ),
    byLevel: metric(
      levelCounts.map(({ level, range, count }) => ({
        level,
        minXp: range.min,
        maxXp: range.maxExclusive,
        talents: count,
        share: share(count, cohort),
      })),
      "Répartition des talents du périmètre par palier d'XP, avec les bornes de chaque palier. Ce sont des paliers internes, jamais affichés aux élèves ; tout le monde y figure, y compris à zéro XP.",
    ),
    attempts: metric(
      attempts,
      'Parties de mini-jeux lancées par les talents du périmètre, terminées ou non.',
    ),
    finishedAttempts: metric(finished, "Parties menées jusqu'au bout."),
    finishedShare: metric(
      share(finished, attempts),
      "Part des parties lancées qui ont été menées jusqu'au bout, en pourcentage : le complément est l'abandon en cours de partie. Vaut null quand aucune partie n'a été lancée.",
    ),
    players: metric(
      players,
      'Talents du périmètre ayant lancé au moins une partie de mini-jeu.',
    ),
    playersShare: metric(
      share(players, cohort),
      "Part du périmètre ayant lancé au moins une partie, en pourcentage. C'est la mesure d'usage la plus directe de la partie ludique de Jump.",
    ),
    games: metric(
      rotation.map((config) => ({
        game: config.game,
        enabled: config.enabled,
        weight: config.weight,
        attempts: attemptsPerGame.get(config.game) ?? 0,
        share: share(attemptsPerGame.get(config.game) ?? 0, attempts),
      })),
      "Les jeux du carrousel quotidien : « enabled » dit s'il peut encore être tiré, « weight » sa fréquence relative, « attempts » le nombre de parties lancées par le périmètre et « share » la part des parties du périmètre qui s'est jouée dessus. Un jeu désactivé peut afficher des parties : ce sont celles jouées avant sa désactivation.",
    ),
  };
}
