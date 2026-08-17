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
  type BreakdownTail,
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

/** What the interests past the cap represent together, or null if there are none. */
export type InterestTail = { declarations: number; interests: number } | null;

export type InterestsBreakdown = {
  filters: { schoolYear: string; campus: string; event: string };
  cohort: Metric;
  tech: Metric<InterestRow[]>;
  otherTech: Metric<InterestTail>;
  general: Metric<InterestRow[]>;
  otherGeneral: Metric<InterestTail>;
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
  // Both rankings capped the same way, and both reporting what the cap left out.
  // Only tech used to: the general list was sliced bare, and it is the one that
  // actually overflows (the catalogue ships 9 tech interests against 25 general
  // ones, and staff add to it from /staff/admin/interests), so the side that
  // silently dropped rows was the side with no tail figure.
  const techBreakdown = toBreakdown(tech, INTERESTS_TOP_N);
  const generalBreakdown = toBreakdown(general, INTERESTS_TOP_N);

  const row = (stat: InterestStat): InterestRow => ({
    interest: stat.nom,
    declarations: stat.count,
    cohortShare: share(stat.count, cohort),
  });

  const tail = (others: BreakdownTail | null): InterestTail =>
    others
      ? { declarations: others.count, interests: others.categories }
      : null;

  const tailDefinition = (kind: string) =>
    `Ce que représentent, ensemble, les centres d'intérêt ${kind} au-delà des ${INTERESTS_TOP_N} premiers. Vaut null quand il n'y en a pas.`;

  return {
    filters: scopeLabels(scope),
    cohort: metric(
      cohort,
      `Talents du périmètre, ${VISIBLE_PARTICIPATION_DEFINITION}. Sert de dénominateur aux pourcentages ci-dessous.`,
    ),
    tech: metric(
      techBreakdown.rows.map(row),
      `Centres d'intérêt tech déclarés par les talents du périmètre, du plus au moins cité, limité aux ${INTERESTS_TOP_N} premiers ; « otherTech » dit ce que pèse le reste. « declarations » compte les talents qui l'ont coché : un talent qui en coche trois apparaît dans trois lignes, donc la somme des lignes dépasse la taille de la cohorte.`,
    ),
    otherTech: metric(tail(techBreakdown.others), tailDefinition('tech')),
    general: metric(
      generalBreakdown.rows.map(row),
      `Centres d'intérêt non tech déclarés par les talents du périmètre, du plus au moins cité, limité aux ${INTERESTS_TOP_N} premiers ; « otherGeneral » dit ce que pèse le reste. Même mode de comptage que ci-dessus : ce sont des déclarations, pas des personnes.`,
    ),
    otherGeneral: metric(
      tail(generalBreakdown.others),
      tailDefinition('non tech'),
    ),
  };
}
