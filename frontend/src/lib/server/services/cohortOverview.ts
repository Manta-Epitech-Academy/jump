import type { ScopedPrismaClient } from '$lib/server/db/scoped';
import { prisma } from '$lib/server/db';

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

export type LyceesBreakdown = Breakdown<LyceeStat>;
export type InterestsBreakdown = Breakdown<InterestStat>;

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
 * Full lycée ranking for the cohort, most-represented first. Talents with a
 * free-text lycée (no UAI → no `School` row) aren't grouped here: the breakdown
 * covers resolved establishments only. `School` is a global reference table
 * (not campus-scoped), so names are read off the unscoped client.
 */
export async function rankLyceesByCohort(
  db: ScopedPrismaClient,
  eventId: string,
): Promise<LyceeStat[]> {
  const grouped = await db.talent.groupBy({
    by: ['schoolId'],
    where: {
      schoolId: { not: null },
      participations: { some: { eventId } },
    },
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
  db: ScopedPrismaClient,
  eventId: string,
  { techOnly = false }: { techOnly?: boolean } = {},
): Promise<InterestStat[]> {
  const grouped = await db.talentInterest.groupBy({
    by: ['interestId'],
    where: {
      talent: { participations: { some: { eventId } } },
      ...(techOnly ? { interest: { kind: 'tech' } } : {}),
    },
    _count: { _all: true },
    orderBy: { _count: { interestId: 'desc' } },
  });

  if (grouped.length === 0) return [];

  const interests = await db.interest.findMany({
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

/** Convenience: full lycée ranking capped to the dashboard's top-N card. */
export async function loadLyceesBreakdown(
  db: ScopedPrismaClient,
  eventId: string,
): Promise<LyceesBreakdown> {
  return toBreakdown(await rankLyceesByCohort(db, eventId));
}

/** Convenience: full interest ranking capped to the dashboard's top-N card. */
export async function loadInterestsCloud(
  db: ScopedPrismaClient,
  eventId: string,
): Promise<InterestsBreakdown> {
  return toBreakdown(await rankInterestsByCohort(db, eventId));
}
