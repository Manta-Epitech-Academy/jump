import type { Prisma, PrismaClient } from '@prisma/client';
import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import { prisma } from '$lib/server/db';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';

/**
 * Origin breakdowns for a stage cohort — "where do these inscrits come from"
 * (top lycées) and "what are they into" (top centres d'intérêt). Shared by the
 * event dashboard (prep/ongoing views) and the Inscrits page sidebar so the two
 * surfaces can never drift on how the cohort is ranked or summarised.
 *
 * Everything here is whole-event: rankings ignore any in-page filter so the
 * breakdown stays a stable picture of the cohort the user can drill into.
 */

/** Default cap for the dashboard's side-by-side breakdown cards. */
const BREAKDOWN_TOP_N = 10;

export type LyceeStat = { schoolId: string; name: string; count: number };
export type InterestStat = {
  interestId: string;
  nom: string;
  emoji: string | null;
  count: number;
};

/**
 * Tail aggregate over the rows past the cap. `count` semantics differ per
 * ranking — unique talents for lycées (one lycée each), declarations for
 * interests (a talent picking 3 tail interests adds 3) — and the rendering
 * component labels it accordingly.
 */
export type BreakdownTail = { count: number; categories: number };

export type Breakdown<T> = { rows: T[]; others: BreakdownTail | null };

/**
 * The client a ranking runs on: the dev workspace hands in its campus-scoped one
 * (which enforces "my campus only" inside the query), the admin API hands in the
 * plain one, because admins are cross-campus by design.
 *
 * The two are the same object at runtime and expose the same delegates; only
 * their generic parameters differ, so neither is assignable to the other. Rather
 * than duplicate a ranking per client, the union is narrowed once, here, by
 * `asCohortClient`. The queries below use nothing the extension changes.
 */
export type CohortClient = PrismaClient | ScopedPrismaClient;

const asCohortClient = (db: CohortClient) => db as PrismaClient;

/**
 * Splits a full ranking into the visible top-N plus a summarised tail. Pure —
 * callers fetch the ranking once (e.g. to feed both a filter dropdown and a
 * capped card) and slice it as needed. Tail `count` sums the per-row counts,
 * which works for both rankings (see {@link BreakdownTail}).
 */
export function toBreakdown<T extends { count: number }>(
  ranking: T[],
  topN: number = BREAKDOWN_TOP_N,
): Breakdown<T> {
  const rows = ranking.slice(0, topN);
  const tail = ranking.slice(topN);
  const others =
    tail.length === 0
      ? null
      : {
          count: tail.reduce((sum, r) => sum + r.count, 0),
          categories: tail.length,
        };
  return { rows, others };
}

/**
 * The talents of one event, as a `Talent` filter: enrolled, and visible in Jump.
 *
 * Exported so a caller states which cohort it wants without restating the
 * status rule. The rankings below take an arbitrary filter rather than an event
 * id, because the admin API ranks over a campus or a whole school year using
 * the same two groupBys; keeping one ranking and varying the cohort is what
 * stops the two surfaces drifting on how a lycée is counted.
 */
export function eventCohortWhere(eventId: string): Prisma.TalentWhereInput {
  return {
    participations: { some: { eventId, ...visibleParticipationWhere } },
  };
}

/**
 * Full lycée ranking for the cohort, most-represented first. Talents with a
 * free-text lycée (no UAI → no `School` row) aren't grouped here: the breakdown
 * covers resolved establishments only. `School` is a global reference table
 * (not campus-scoped), so names are read off the unscoped client.
 */
export async function rankLyceesByCohort(
  db: CohortClient,
  cohort: Prisma.TalentWhereInput,
): Promise<LyceeStat[]> {
  const grouped = await asCohortClient(db).talent.groupBy({
    by: ['schoolId'],
    where: { AND: [cohort, { schoolId: { not: null } }] },
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
  });

  if (grouped.length === 0) return [];

  const ids = grouped
    .map((g) => g.schoolId)
    .filter((id): id is string => id !== null);
  const schools = await prisma.school.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = new Map(schools.map((s) => [s.id, s.name]));

  return grouped
    .filter((g): g is typeof g & { schoolId: string } => g.schoolId !== null)
    .map((g) => ({
      schoolId: g.schoolId,
      name: nameById.get(g.schoolId) ?? '—',
      count: g._count._all,
    }));
}

/**
 * Full interest ranking for the cohort, most-declared first. Counts are
 * declarations, not unique talents (a talent declaring N interests contributes
 * to N rows). `techOnly` restricts to `Interest.kind === 'tech'` — the signal
 * dev staff recruit on (the non-tech "general" interests are dropped).
 */
export async function rankInterestsByCohort(
  db: CohortClient,
  cohort: Prisma.TalentWhereInput,
  { techOnly = false }: { techOnly?: boolean } = {},
): Promise<InterestStat[]> {
  const grouped = await asCohortClient(db).talentInterest.groupBy({
    by: ['interestId'],
    where: {
      talent: cohort,
      ...(techOnly ? { interest: { kind: 'tech' } } : {}),
    },
    _count: { _all: true },
    orderBy: { _count: { interestId: 'desc' } },
  });

  if (grouped.length === 0) return [];

  const interests = await asCohortClient(db).interest.findMany({
    where: { id: { in: grouped.map((g) => g.interestId) } },
  });
  const byId = new Map(interests.map((i) => [i.id, i]));

  return grouped.flatMap((g) => {
    const i = byId.get(g.interestId);
    if (!i) return [];
    return [
      { interestId: i.id, nom: i.nom, emoji: i.emoji, count: g._count._all },
    ];
  });
}
