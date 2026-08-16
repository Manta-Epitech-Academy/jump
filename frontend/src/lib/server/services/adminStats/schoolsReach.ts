/**
 * Which lycées Jump actually reaches, and how widely.
 *
 * Ranked with `rankLyceesByCohort`, the same function the dev workspace's
 * inscrits sidebar uses, so "le lycée le plus représenté" means one thing on
 * both surfaces. What this adds is the reach view a campus page cannot give:
 * how many distinct establishments, how many départements, and how much of the
 * cohort is not attributable to any of them.
 *
 * That last figure matters more than it looks. A lycée only becomes a `School`
 * row once its UAI resolves; a talent whose lycée has no UAI carries a free-text
 * name instead, and one who never finished the school step carries nothing. Both
 * are invisible in the ranking, so the ranking alone would quietly overstate how
 * well we know where the cohort comes from.
 */

import { prisma } from '$lib/server/db';
import {
  rankLyceesByCohort,
  toBreakdown,
  type LyceeStat,
} from '$lib/server/services/cohortOverview';
import { departementOf, academieOf } from '$lib/domain/school';
import { VISIBLE_PARTICIPATION_DEFINITION } from '$lib/domain/sfMemberStatus';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { cohortWhere, scopeLabels } from './cohort';

/** Lycées listed by name before the tail is summarised. */
export const SCHOOLS_TOP_N = 25;

/**
 * What "un lycée touché" counts, owned here and imported by the campus comparison
 * and the churn answer. The UAI clause is the load-bearing half: a lycée Jump only
 * knows by a hand-typed name is invisible to every figure built on this rule.
 */
export const DISTINCT_SCHOOLS_RULE =
  "Nombre de lycées distincts d'où vient au moins un talent. Ne comptent que les lycées identifiés par leur code UAI officiel : un lycée connu seulement par un nom saisi à la main n'y figure pas.";

export type SchoolRow = {
  name: string;
  city: string | null;
  departement: string | null;
  talents: number;
  /** Percentage of the cohort attending this lycée. */
  cohortShare: number | null;
};

export type DepartementRow = {
  departement: string;
  schools: number;
  talents: number;
};

export type AcademieRow = {
  academie: string;
  schools: number;
  talents: number;
};

export type SchoolsReach = {
  filters: { schoolYear: string; campus: string; event: string };
  cohort: Metric;
  schools: Metric;
  departements: Metric;
  topSchools: Metric<SchoolRow[]>;
  otherSchools: Metric<{ talents: number; schools: number } | null>;
  byDepartement: Metric<DepartementRow[]>;
  byAcademie: Metric<AcademieRow[]>;
  withoutResolvedSchool: Metric;
  withoutResolvedSchoolShare: Metric<number | null>;
};

export async function getSchoolsReach(
  scope: Scope = {},
): Promise<SchoolsReach> {
  const where = await cohortWhere(scope);

  // Admins are cross-campus, so the unscoped client is the right one here (the
  // dev workspace passes its campus-scoped client to the same function).
  const [cohort, ranking, attributed] = await Promise.all([
    prisma.talent.count({ where }),
    rankLyceesByCohort(prisma, where),
    prisma.talent.count({
      where: { AND: [where, { schoolId: { not: null } }] },
    }),
  ]);

  const details = await schoolDetails(ranking);
  const breakdown = toBreakdown(ranking, SCHOOLS_TOP_N);

  const byDepartement = new Map<string, DepartementRow>();
  const byAcademie = new Map<string, AcademieRow>();
  for (const row of ranking) {
    const departement = details.get(row.schoolId)?.departement;
    if (!departement) continue;
    const bucket = byDepartement.get(departement) ?? {
      departement,
      schools: 0,
      talents: 0,
    };
    bucket.schools += 1;
    bucket.talents += row.count;
    byDepartement.set(departement, bucket);

    // Rolled up from the département rather than looked up per school: the
    // académie is a function of the département, so deriving it twice would be
    // two chances to disagree.
    const academie = academieOf(departement);
    if (!academie) continue;
    const academieBucket = byAcademie.get(academie) ?? {
      academie,
      schools: 0,
      talents: 0,
    };
    academieBucket.schools += 1;
    academieBucket.talents += row.count;
    byAcademie.set(academie, academieBucket);
  }

  return {
    filters: scopeLabels(scope),
    cohort: metric(
      cohort,
      `Talents du périmètre, ${VISIBLE_PARTICIPATION_DEFINITION}. Sert de dénominateur aux pourcentages ci-dessous.`,
    ),
    schools: metric(
      ranking.length,
      `${DISTINCT_SCHOOLS_RULE} Porte ici sur les talents du périmètre.`,
    ),
    departements: metric(
      byDepartement.size,
      'Nombre de départements distincts couverts par ces lycées, déduits de leur code postal. La Corse est comptée comme un seul département (« 20 »), le code postal ne permettant pas de distinguer 2A de 2B.',
    ),
    topSchools: metric(
      breakdown.rows.map((row) => ({
        name: row.name,
        city: details.get(row.schoolId)?.city ?? null,
        departement: details.get(row.schoolId)?.departement ?? null,
        talents: row.count,
        cohortShare: share(row.count, cohort),
      })),
      `Les ${SCHOOLS_TOP_N} lycées les plus représentés, du plus au moins représenté. « talents » est le nombre de talents du périmètre qui y sont scolarisés, « cohortShare » leur part de la cohorte en pourcentage.`,
    ),
    otherSchools: metric(
      breakdown.others
        ? {
            talents: breakdown.others.count,
            schools: breakdown.others.categories,
          }
        : null,
      `Ce que représentent, ensemble, les lycées au-delà des ${SCHOOLS_TOP_N} premiers. Vaut null quand il n'y en a pas.`,
    ),
    byDepartement: metric(
      [...byDepartement.values()].sort((a, b) => b.talents - a.talents),
      "Répartition par département, du plus au moins représenté : nombre de lycées et nombre de talents. C'est la couverture territoriale du périmètre.",
    ),
    byAcademie: metric(
      [...byAcademie.values()].sort((a, b) => b.talents - a.talents),
      "Mêmes lycées regroupés par académie, du plus au moins représenté. L'académie est l'échelon avec lequel un partenariat se négocie, là où le département décrit seulement la provenance. Les lycées d'un territoire relevant d'un vice-rectorat sans académie nommée (Saint-Pierre-et-Miquelon, TAAF) ne sont dans aucune ligne : le total des talents peut donc être inférieur à celui de la répartition par département.",
    ),
    withoutResolvedSchool: metric(
      cohort - attributed,
      "Talents du périmètre rattachés à aucun lycée identifié : soit leur lycée n'a pas de code UAI et n'est connu que par un nom saisi à la main, soit ils n'ont pas encore renseigné leur établissement. Ils n'apparaissent dans aucun classement ci-dessus.",
    ),
    withoutResolvedSchoolShare: metric(
      share(cohort - attributed, cohort),
      'Part de la cohorte rattachée à aucun lycée identifié, en pourcentage. Plus elle est élevée, moins les classements ci-dessus décrivent la cohorte entière.',
    ),
  };
}

/** City and département for the ranked schools, in one lookup. */
async function schoolDetails(ranking: LyceeStat[]) {
  if (ranking.length === 0) {
    return new Map<
      string,
      { city: string | null; departement: string | null }
    >();
  }
  const rows = await prisma.school.findMany({
    where: { id: { in: ranking.map((r) => r.schoolId) } },
    select: { id: true, city: true, postalCode: true },
  });
  return new Map(
    rows.map((s) => [
      s.id,
      { city: s.city, departement: departementOf(s.postalCode) },
    ]),
  );
}
