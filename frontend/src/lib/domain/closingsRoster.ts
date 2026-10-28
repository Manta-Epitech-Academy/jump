import type { ClosingRecommendation } from '@prisma/client';
import {
  CLOSING_RECOMMENDATIONS,
  CLOSING_RECOMMENDATION_DISPLAY_ORDER,
  CLOSING_RECOMMENDATION_VALUES,
  CLOSING_STATUS_LABELS,
  type ClosingListStatus,
} from './closing';
import {
  byCount,
  FACET_NONE,
  listFacets,
  matchesListFacets,
  type FacetDef,
  type ListFacet,
} from './listFacets';
import {
  CLOSINGS_FACETS,
  type ClosingsFacet,
  type ClosingsView,
} from './closingsView';

/** One row of an event's closings roster: an enrolment the dev space shows,
 *  plus its closing (if any). Absence of a closing is the "à faire" status. */
export type ClosingRow = {
  talentId: string;
  nom: string;
  prenom: string;
  status: ClosingListStatus;
  /** Who conducted it: the « Mené par » filter's value. */
  staffId: string | null;
  staffName: string | null;
  staffImage: string | null;
  conductedAt: Date | string | null;
  recommendation: ClosingRecommendation | null;
};

/** How many enrolments sit in each status (à faire / en cours / finalisé). */
export type ClosingCounts = Record<ClosingListStatus, number>;

/** The team's verdict over finalised closings. */
export type RecoCounts = Record<ClosingRecommendation, number>;

/** The roster with its tallies, as the Closings page and the event home read
 *  it. `total` is the number of enrolments, the denominator of every share. */
export type ClosingsRoster = {
  rows: ClosingRow[];
  counts: ClosingCounts;
  recoCounts: RecoCounts;
  total: number;
};

/**
 * The status buckets and the verdict breakdown of a roster. A verdict counts
 * only once its closing is finalised: an in-progress closing may carry a
 * recommendation picked mid-way, which is not yet the team's conclusion.
 */
export function tallyClosings(
  rows: readonly ClosingRow[],
): Pick<ClosingsRoster, 'counts' | 'recoCounts'> {
  const counts: ClosingCounts = { todo: 0, in_progress: 0, done: 0 };
  const recoCounts = Object.fromEntries(
    CLOSING_RECOMMENDATION_VALUES.map((r) => [r, 0]),
  ) as RecoCounts;
  for (const row of rows) {
    counts[row.status]++;
    if (row.status === 'done' && row.recommendation)
      recoCounts[row.recommendation]++;
  }
  return { counts, recoCounts };
}

/** The Closings table's column filters, the mockup's header filters. */
const FACETS: Record<ClosingsFacet, FacetDef<ClosingRow>> = {
  mene: {
    title: 'Mené par',
    valuesOf: (r) => [r.staffId ?? FACET_NONE],
    vocabulary: (rows) => [
      ...byCount(rows, (r) =>
        r.staffId && r.staffName ? [[r.staffId, r.staffName]] : [],
      ),
      [FACET_NONE, 'Pas encore mené'],
    ],
  },
  statut: {
    title: 'Statut',
    valuesOf: (r) => [r.status],
    // Least advanced first: the talents still to call lead.
    vocabulary: () =>
      (['todo', 'in_progress', 'done'] as const).map((s) => [
        s,
        CLOSING_STATUS_LABELS[s],
      ]),
  },
  avis: {
    title: 'Avis',
    valuesOf: (r) => [r.recommendation ?? FACET_NONE],
    vocabulary: () => [
      ...CLOSING_RECOMMENDATION_DISPLAY_ORDER.map((r): [string, string] => [
        r,
        CLOSING_RECOMMENDATIONS[r].label,
      ]),
      [FACET_NONE, 'Sans avis'],
    ],
  },
};

export type ClosingsFacetState = ListFacet<ClosingsFacet>;

/** The facets with their counted values and what the view ticks in them. */
export function closingsFacets(
  rows: readonly ClosingRow[],
  view: ClosingsView,
): ClosingsFacetState[] {
  return listFacets(rows, FACETS, CLOSINGS_FACETS, view.facets);
}

/** Whether a row survives every active facet. */
export function matchesClosingsFacets(
  row: ClosingRow,
  facets: readonly ClosingsFacetState[],
): boolean {
  return matchesListFacets(row, facets, FACETS);
}
