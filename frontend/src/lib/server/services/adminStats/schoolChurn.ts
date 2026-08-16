/**
 * Which lycées are new this year, which came back, and which stopped sending
 * anyone.
 *
 * `schoolsReach` answers "how far do we reach", which is a stock. This answers the
 * flow, and the flow is what somebody acts on: a lycée that sent twelve students
 * last year and none this year is not a statistic, it is a phone call. Nothing else
 * in the platform surfaces that, because it needs two périmètres compared, and every
 * other aggregate describes one.
 *
 * Both school years are required, and neither has a default. A churn against an
 * implicit "last year" would silently compare against a year that may not exist, or
 * against the year today falls in, which diverges from the year an event falls in
 * every 31 July.
 *
 * Names, not ids. A lycée is a public establishment, not a person, and `topSchools`
 * already returns names; a churn list whose rows could not be read out loud would
 * answer the question without being usable.
 *
 * Ranked by what the lycée sent, most first, so a truncated list keeps the rows worth
 * acting on. Both lists are capped and say so.
 */

import { prisma } from '$lib/server/db';
import { rankLyceesByCohort } from '$lib/server/services/cohortOverview';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { cohortWhere, scopeLabels } from './cohort';
import { DISTINCT_SCHOOLS_RULE } from './schoolsReach';

/** Lycées named in each list before it stops. */
export const CHURN_SCHOOLS_LIMIT = 30;

export type ChurnSchool = {
  name: string;
  city: string | null;
  /** Talents this lycée sent on the year the row is about. */
  talents: number;
};

export type SchoolChurn = {
  filters: { schoolYear: string; compareTo: string; campus: string };
  schools: Metric<number>;
  previousSchools: Metric<number>;
  retained: Metric<number>;
  retainedShare: Metric<number | null>;
  gained: Metric<number>;
  lost: Metric<number>;
  gainedSchools: Metric<ChurnSchool[]>;
  lostSchools: Metric<ChurnSchool[]>;
  truncated: boolean;
};

export async function getSchoolChurn(
  scope: Scope,
  years: { schoolYear: string; compareTo: string },
): Promise<SchoolChurn> {
  // Two rankings over the same shared cohort definition, differing only by the
  // year. Both calls validate their year through `scopedEvents`, so an unknown
  // one is refused with the years that exist rather than answered as "everything
  // is new".
  const [current, previous] = await Promise.all([
    rankLyceesByCohort(
      prisma,
      await cohortWhere({ ...scope, schoolYear: years.schoolYear }),
    ),
    rankLyceesByCohort(
      prisma,
      await cohortWhere({ ...scope, schoolYear: years.compareTo }),
    ),
  ]);

  const previousById = new Map(previous.map((row) => [row.schoolId, row]));
  const currentById = new Map(current.map((row) => [row.schoolId, row]));

  const gained = current.filter((row) => !previousById.has(row.schoolId));
  const lost = previous.filter((row) => !currentById.has(row.schoolId));
  const retained = current.length - gained.length;

  const cities = await cityOf([...gained, ...lost].map((row) => row.schoolId));
  const toRows = (rows: typeof current): ChurnSchool[] =>
    rows.slice(0, CHURN_SCHOOLS_LIMIT).map((row) => ({
      name: row.name,
      city: cities.get(row.schoolId) ?? null,
      talents: row.count,
    }));

  return {
    filters: {
      schoolYear: years.schoolYear,
      compareTo: years.compareTo,
      campus: scopeLabels(scope).campus,
    },
    schools: metric(
      current.length,
      `${DISTINCT_SCHOOLS_RULE} Compté ici sur ${years.schoolYear}.`,
    ),
    previousSchools: metric(
      previous.length,
      `${DISTINCT_SCHOOLS_RULE} Compté ici sur ${years.compareTo}, l'année de comparaison.`,
    ),
    retained: metric(
      retained,
      `Lycées ayant envoyé au moins un talent sur les deux années : présents en ${years.compareTo} et de nouveau en ${years.schoolYear}. C'est le socle du réseau.`,
    ),
    retainedShare: metric(
      share(retained, previous.length),
      `Part des lycées de ${years.compareTo} qui ont de nouveau envoyé quelqu'un en ${years.schoolYear}, en pourcentage. Vaut null si aucun lycée n'était identifié en ${years.compareTo}.`,
    ),
    gained: metric(
      gained.length,
      `Lycées présents en ${years.schoolYear} et absents de ${years.compareTo} : les nouveaux du réseau.`,
    ),
    lost: metric(
      lost.length,
      `Lycées présents en ${years.compareTo} et absents de ${years.schoolYear} : ceux qui n'ont envoyé personne cette année. Un lycée peut réapparaître l'année suivante ; cette figure dit qu'il n'a rien envoyé sur l'année demandée, pas qu'il est perdu définitivement.`,
    ),
    gainedSchools: metric(
      toRows(gained),
      `Les nouveaux lycées, du plus au moins représenté, ${CHURN_SCHOOLS_LIMIT} au maximum. « talents » est ce qu'ils ont envoyé en ${years.schoolYear}.`,
    ),
    lostSchools: metric(
      toRows(lost),
      `Les lycées qui n'ont envoyé personne en ${years.schoolYear}, du plus au moins représenté l'année précédente, ${CHURN_SCHOOLS_LIMIT} au maximum. « talents » est ce qu'ils envoyaient en ${years.compareTo} : c'est ce qui a été perdu, donc l'ordre dans lequel les reprendre.`,
    ),
    truncated:
      gained.length > CHURN_SCHOOLS_LIMIT || lost.length > CHURN_SCHOOLS_LIMIT,
  };
}

/** Cities for the named lycées, in one lookup. */
async function cityOf(schoolIds: string[]) {
  if (schoolIds.length === 0) return new Map<string, string | null>();
  const rows = await prisma.school.findMany({
    where: { id: { in: schoolIds } },
    select: { id: true, city: true },
  });
  return new Map(rows.map((s) => [s.id, s.city]));
}
