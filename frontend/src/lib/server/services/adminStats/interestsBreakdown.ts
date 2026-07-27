/**
 * What the cohort says it is into.
 *
 * Ranked with `rankInterestsByCohort`, the same function behind the dev
 * workspace's inscrits sidebar, so the two surfaces order and count interests
 * identically. Split tech / général here because they answer different
 * questions: the tech ranking is the recruitment signal the dev team reads, the
 * general one is who these students are.
 *
 * Counts are declarations, not people: a talent who ticks three interests adds
 * one to three rows. Said in the definition, because summing them and comparing
 * to the cohort is exactly the mistake the wording has to prevent.
 */

import { prisma } from '$lib/server/db';
import {
  rankInterestsByCohort,
  toBreakdown,
  type InterestStat,
} from '$lib/server/services/cohortOverview';
import { VISIBLE_PARTICIPATION_DEFINITION } from '$lib/domain/sfMemberStatus';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { cohortWhere, scopeLabels } from './cohort';

/** Interests listed by name before the tail is summarised. */
export const INTERESTS_TOP_N = 20;

export type InterestRow = {
  /** The interest's French name, as staff maintain it in the catalogue. */
  interest: string;
  declarations: number;
  /** Percentage of the cohort that declared it. */
  cohortShare: number | null;
};

export type InterestsBreakdown = {
  filters: { schoolYear: string; campus: string; event: string };
  cohort: Metric;
  tech: Metric<InterestRow[]>;
  general: Metric<InterestRow[]>;
  otherTech: Metric<{ declarations: number; interests: number } | null>;
};

export async function getInterestsBreakdown(
  scope: Scope = {},
): Promise<InterestsBreakdown> {
  const where = await cohortWhere(scope);

  const [cohort, all, tech] = await Promise.all([
    prisma.talent.count({ where }),
    rankInterestsByCohort(prisma, where),
    rankInterestsByCohort(prisma, where, { techOnly: true }),
  ]);

  const techIds = new Set(tech.map((i) => i.interestId));
  const general = all.filter((i) => !techIds.has(i.interestId));
  const techBreakdown = toBreakdown(tech, INTERESTS_TOP_N);

  const row = (stat: InterestStat): InterestRow => ({
    interest: stat.nom,
    declarations: stat.count,
    cohortShare: share(stat.count, cohort),
  });

  return {
    filters: scopeLabels(scope),
    cohort: metric(
      cohort,
      `Talents du périmètre, ${VISIBLE_PARTICIPATION_DEFINITION}. Sert de dénominateur aux pourcentages ci-dessous.`,
    ),
    tech: metric(
      techBreakdown.rows.map(row),
      `Centres d'intérêt tech déclarés par les talents du périmètre, du plus au moins cité, limité aux ${INTERESTS_TOP_N} premiers. « declarations » compte les talents qui l'ont coché : un talent qui en coche trois apparaît dans trois lignes, donc la somme des lignes dépasse la taille de la cohorte.`,
    ),
    general: metric(
      general.slice(0, INTERESTS_TOP_N).map(row),
      `Centres d'intérêt non tech déclarés par les talents du périmètre, du plus au moins cité, limité aux ${INTERESTS_TOP_N} premiers. Même mode de comptage que ci-dessus : ce sont des déclarations, pas des personnes.`,
    ),
    otherTech: metric(
      techBreakdown.others
        ? {
            declarations: techBreakdown.others.count,
            interests: techBreakdown.others.categories,
          }
        : null,
      `Ce que représentent, ensemble, les centres d'intérêt tech au-delà des ${INTERESTS_TOP_N} premiers. Vaut null quand il n'y en a pas.`,
    ),
  };
}
