import type { ClosingRecommendation } from '@prisma/client';
import {
  CLOSING_RECOMMENDATION_VALUES,
  type ClosingListStatus,
} from './closing';

/** One row of an event's closings roster: an enrolment the dev space shows,
 *  plus its closing (if any). Absence of a closing is the "à faire" status. */
export type ClosingRow = {
  talentId: string;
  nom: string;
  prenom: string;
  status: ClosingListStatus;
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
