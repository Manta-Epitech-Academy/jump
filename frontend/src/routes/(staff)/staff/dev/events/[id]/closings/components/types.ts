import type { ClosingRecommendation } from '@prisma/client';
import type { ClosingListStatus } from '$lib/domain/closing';

/** One row of the Closings list: an event participant plus their closing (if
 *  any). Absence of a closing is the "à faire" status. */
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

export type SortKey = 'prenom' | 'nom' | 'staff' | 'date' | 'status';

/** One staff member with the number of closings they conducted, for the
 *  "Closings menés" leaderboard. */
export type StaffTally = {
  id: string;
  name: string;
  image: string | null;
  count: number;
};

/** Status buckets for the synthesis card. */
export type ClosingCounts = {
  todo: number;
  in_progress: number;
  done: number;
};

/** Recommendation breakdown over finalised closings. */
export type RecoCounts = Record<ClosingRecommendation, number>;

/** The cohort payload streamed behind the page shell's `{#await}` — everything
 *  that needs the DB. Shared by the page load and `ClosingsResults` so the
 *  streamed shape and the consuming component can never drift. */
export type ClosingsCohort = {
  rows: ClosingRow[];
  counts: ClosingCounts;
  recoCounts: RecoCounts;
  topStaff: StaffTally[];
  total: number;
};
