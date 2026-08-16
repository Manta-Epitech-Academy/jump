/**
 * Do they come back? The distribution of talents by how many events of the
 * périmètre they enrolled in.
 *
 * There is no `eventId` filter on this operation, and that is the design rather
 * than an omission: inside a single event every talent has exactly one
 * enrolment, so the question has one possible answer and asking it would only
 * ever produce a misleading 100 %. A campus or a school year is the smallest
 * périmètre where "revenir" means anything.
 *
 * Counted over enrolments Jump shows, so a talent who signed up and was later
 * marked désisté in Salesforce is not counted as having come.
 */

import { prisma } from '$lib/server/db';
import { VISIBLE_PARTICIPATION_DEFINITION } from '$lib/domain/sfMemberStatus';
import { metric, share, type Metric } from '$lib/server/adminApi/metrics';
import type { Scope } from '$lib/server/adminApi/scope';
import { participationWhere, scopeLabels } from './cohort';

/** Everything at or above this many events is one bucket. */
const LAST_BUCKET = 3;

/**
 * The returning rule, and the caveat that has to travel with it.
 *
 * Owned here, imported by the campus comparison. The second sentence exists because
 * this figure is the one most certain to be misquoted: a stage de seconde is not a
 * repeatable event, so on most périmètres the value is structurally near zero, and
 * a steering reader handed a bare 2 % reads "on a un problème de fidélisation"
 * where the programme simply offers each talent one event.
 */
export const RETURNING_SHARE_RULE =
  "Part des talents inscrits à plus d'un événement du périmètre, en pourcentage : ceux qui sont revenus. Une valeur basse peut signifier que le périmètre n'offre qu'un seul événement par talent, ce qui est le cas d'un stage non répétable, et non que les talents se désengagent ; le nombre d'événements du périmètre est à lire avec elle.";

export type RetentionBucket = {
  /** Number of events, or `LAST_BUCKET` meaning "that many or more". */
  events: number;
  label: string;
  talents: number;
  /** Percentage of the talents in scope. */
  cohortShare: number | null;
};

export type TalentRetention = {
  filters: { schoolYear: string; campus: string };
  talents: Metric;
  enrolments: Metric;
  buckets: Metric<RetentionBucket[]>;
  returning: Metric;
  returningShare: Metric<number | null>;
  averageEventsPerTalent: Metric<number | null>;
};

export async function getTalentRetention(
  scope: Scope = {},
): Promise<TalentRetention> {
  const where = await participationWhere(scope);

  // One row per talent with their enrolment count. The cohort is a few thousand
  // rows at most, so bucketing in memory beats three separate count queries.
  const perTalent = await prisma.participation.groupBy({
    by: ['talentId'],
    where,
    _count: { _all: true },
  });

  const talents = perTalent.length;
  const enrolments = perTalent.reduce((sum, p) => sum + p._count._all, 0);

  const counts = new Map<number, number>();
  for (const p of perTalent) {
    const bucket = Math.min(p._count._all, LAST_BUCKET);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const buckets: RetentionBucket[] = Array.from(
    { length: LAST_BUCKET },
    (_, i) => {
      const events = i + 1;
      const isLast = events === LAST_BUCKET;
      const talentsInBucket = counts.get(events) ?? 0;
      return {
        events,
        label: isLast
          ? `${events} événements ou plus`
          : `${events} événement${events > 1 ? 's' : ''}`,
        talents: talentsInBucket,
        cohortShare: share(talentsInBucket, talents),
      };
    },
  );

  const returning = talents - (counts.get(1) ?? 0);

  return {
    filters: {
      schoolYear: scopeLabels(scope).schoolYear,
      campus: scopeLabels(scope).campus,
    },
    talents: metric(
      talents,
      `Talents distincts inscrits à au moins un événement du périmètre, ${VISIBLE_PARTICIPATION_DEFINITION}.`,
    ),
    enrolments: metric(
      enrolments,
      "Total des inscriptions du périmètre. Un talent inscrit à deux événements en compte deux : c'est le nombre de places occupées, pas le nombre de personnes.",
    ),
    buckets: metric(
      buckets,
      `Répartition des talents selon le nombre d'événements du périmètre auxquels ils sont inscrits. Chaque talent n'apparaît que dans une ligne ; la dernière regroupe ${LAST_BUCKET} événements et plus.`,
    ),
    returning: metric(
      returning,
      "Talents inscrits à plus d'un événement du périmètre : ceux qui sont revenus.",
    ),
    returningShare: metric(
      share(returning, talents),
      `${RETURNING_SHARE_RULE} Vaut null si le périmètre ne compte aucun talent.`,
    ),
    averageEventsPerTalent: metric(
      talents > 0 ? Math.round((enrolments / talents) * 100) / 100 : null,
      "Nombre moyen d'événements du périmètre par talent. Vaut null si le périmètre ne compte aucun talent.",
    ),
  };
}
