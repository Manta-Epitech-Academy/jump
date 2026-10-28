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
 * The team's verdict on a closing, once it is one: an in-progress closing may
 * carry a recommendation picked mid-way, which is not yet the team's
 * conclusion, so only a finalised closing has a verdict. The one reading of it,
 * for every surface that shows or counts one (the home's card, the Closings
 * list and its filter, the exported sheet), so no two of them can disagree.
 */
export function closingVerdict(
  row: Pick<ClosingRow, 'status' | 'recommendation'>,
): ClosingRecommendation | null {
  return row.status === 'done' ? row.recommendation : null;
}

/** The status buckets and the verdict breakdown of a roster. */
export function tallyClosings(
  rows: readonly ClosingRow[],
): Pick<ClosingsRoster, 'counts' | 'recoCounts'> {
  const counts: ClosingCounts = { todo: 0, in_progress: 0, done: 0 };
  const recoCounts = Object.fromEntries(
    CLOSING_RECOMMENDATION_VALUES.map((r) => [r, 0]),
  ) as RecoCounts;
  for (const row of rows) {
    counts[row.status]++;
    const verdict = closingVerdict(row);
    if (verdict) recoCounts[verdict]++;
  }
  return { counts, recoCounts };
}

/** « Mené par » of a closing nobody has begun. */
export const NOT_CONDUCTED_LABEL = 'Pas encore mené';

/**
 * « Mené par » of a closing whose conductor's account has been deleted since:
 * the record keeps the closing and loses who held it (`Closing_Record.staff`
 * is `onDelete: SetNull`), so it reads as held by someone who left, never as a
 * closing still to conduct.
 */
const CONDUCTOR_GONE = 'ancien';
const CONDUCTOR_GONE_LABEL = "Ancien membre de l'équipe";

/** A row's « Mené par » value: its conductor, else whether one ever was. */
function conductorValue(row: Pick<ClosingRow, 'staffId' | 'status'>): string {
  if (row.staffId) return row.staffId;
  return row.status === 'todo' ? FACET_NONE : CONDUCTOR_GONE;
}

/** Who held a closing, as the list and the sheet write it: their name, or
 *  that they left; null for a closing nobody has begun. */
export function conductorLabel(
  row: Pick<ClosingRow, 'staffId' | 'staffName' | 'status'>,
): string | null {
  if (row.staffName) return row.staffName;
  return conductorValue(row) === CONDUCTOR_GONE ? CONDUCTOR_GONE_LABEL : null;
}

/** The Closings table's column filters, the mockup's header filters. */
const FACETS: Record<ClosingsFacet, FacetDef<ClosingRow>> = {
  mene: {
    title: 'Mené par',
    valuesOf: (r) => [conductorValue(r)],
    vocabulary: (rows) => [
      ...byCount(rows, (r) =>
        r.staffId && r.staffName ? [[r.staffId, r.staffName]] : [],
      ),
      [CONDUCTOR_GONE, CONDUCTOR_GONE_LABEL],
      [FACET_NONE, NOT_CONDUCTED_LABEL],
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
    valuesOf: (r) => [closingVerdict(r) ?? FACET_NONE],
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
