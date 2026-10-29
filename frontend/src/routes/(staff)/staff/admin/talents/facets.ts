import { prisma } from '$lib/server/db';
import { NIVEAUX, niveauLabel } from '$lib/domain/niveau';
import {
  offerFacets,
  type CountedFacet,
  type FacetCount,
  type ListFacet,
} from '$lib/domain/listFacets';
import {
  PARENT_STATUS_LABELS,
  TALENT_STATUS_LABELS,
  type ParentCompletionStatus,
  type TalentAccountStatus,
} from './labels';
import { PARENT_WHERE, STATUT_WHERE } from './query';
import {
  parseTalentFilters,
  type TalentFilters,
  type TalentsFacet,
} from './view';

/**
 * The directory's column filters. A list held in memory counts its facets over
 * its rows; the directory is paged on the server, so it counts them in the
 * database and hands the counts to `offerFacets`, where the rules every staff
 * list follows are applied (`$lib/domain/listFacets`). Like every list's, the
 * counts are over the whole directory, not over what the other filters left,
 * so a menu reads the same however the list is narrowed.
 */
export async function talentFacetCounts(): Promise<
  CountedFacet<TalentsFacet>[]
> {
  const statuses = Object.keys(TALENT_STATUS_LABELS) as TalentAccountStatus[];
  const parents = Object.keys(PARENT_STATUS_LABELS) as ParentCompletionStatus[];

  const [niveaux, campuses, campusTalents, statutCounts, parentCounts] =
    await Promise.all([
      prisma.talent.groupBy({ by: ['niveau'], _count: { _all: true } }),
      prisma.campus.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      // The campus filter keeps anyone who attended an event there, so a
      // talent counts once per campus however many of its events they joined.
      prisma.$queryRaw<{ campusId: string; count: bigint }[]>`
        SELECT "campusId", COUNT(DISTINCT "talentId") AS count
        FROM "Participation"
        GROUP BY "campusId"
      `,
      Promise.all(
        statuses.map((s) => prisma.talent.count({ where: STATUT_WHERE[s]() })),
      ),
      Promise.all(
        parents.map((p) => prisma.talent.count({ where: PARENT_WHERE[p] })),
      ),
    ]);

  const byNiveau = new Map(niveaux.map((n) => [n.niveau, n._count._all]));
  const byCampus = new Map(
    campusTalents.map((c) => [c.campusId, Number(c.count)]),
  );

  return [
    {
      facet: 'niveau',
      title: 'Niveau',
      counts: NIVEAUX.map((n) => ({
        value: n,
        label: niveauLabel(n),
        count: byNiveau.get(n) ?? 0,
      })),
    },
    {
      facet: 'campus',
      title: 'Campus',
      counts: campuses.map((c) => ({
        value: c.id,
        label: c.name,
        count: byCampus.get(c.id) ?? 0,
      })),
    },
    {
      facet: 'statut',
      title: 'Statut',
      counts: statuses.map((s, i): FacetCount => ({
        value: s,
        label: TALENT_STATUS_LABELS[s],
        count: statutCounts[i],
      })),
    },
    {
      facet: 'parent',
      title: 'Parent',
      counts: parents.map((p, i): FacetCount => ({
        value: p,
        label: PARENT_STATUS_LABELS[p],
        count: parentCounts[i],
      })),
    },
  ];
}

/**
 * The directory's filters as the address asks for them, with every value the
 * directory does not carry dropped, and the facets the page offers. The page
 * and the export both resolve through here, so the export holds exactly the
 * talents the table shows.
 */
export async function resolveTalentFilters(params: URLSearchParams): Promise<{
  filters: TalentFilters;
  facets: ListFacet<TalentsFacet>[];
}> {
  const parsed = parseTalentFilters(params);
  const facets = offerFacets(await talentFacetCounts(), parsed.facets);
  const kept = Object.fromEntries(
    facets.map((f) => [f.facet, f.selected]),
  ) as TalentFilters['facets'];
  return { filters: { ...parsed, facets: kept }, facets };
}
