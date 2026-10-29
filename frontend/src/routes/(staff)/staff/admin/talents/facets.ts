import { prisma } from '$lib/server/db';
import { compareNiveaux, niveauLabel } from '$lib/domain/niveau';
import {
  FACET_NONE,
  FACET_NONE_LABEL,
  offerFacets,
  type CountedFacet,
  type FacetCount,
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
      // Every niveau the directory holds, in school order, a value not yet
      // normalised to the catalogue included, as on Inscrits.
      counts: [
        ...[...byNiveau.keys()]
          .flatMap((n) => (n === null ? [] : [n]))
          .sort(compareNiveaux)
          .map((n) => ({
            value: n,
            label: niveauLabel(n),
            count: byNiveau.get(n) ?? 0,
          })),
        {
          value: FACET_NONE,
          label: FACET_NONE_LABEL,
          count: byNiveau.get(null) ?? 0,
        },
      ],
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
 * directory does not carry dropped, and the counts they were checked against.
 * The page and the export both resolve through here, so the export holds
 * exactly the talents the table shows; the page applies `offerFacets` to the
 * same counts with the ticks of its own address.
 */
export async function resolveTalentFilters(params: URLSearchParams): Promise<{
  filters: TalentFilters;
  facetCounts: CountedFacet<TalentsFacet>[];
}> {
  const parsed = parseTalentFilters(params);
  const facetCounts = await talentFacetCounts();
  const kept = Object.fromEntries(
    offerFacets(facetCounts, parsed.facets).map((f) => [f.facet, f.selected]),
  ) as TalentFilters['facets'];
  return { filters: { ...parsed, facets: kept }, facetCounts };
}
