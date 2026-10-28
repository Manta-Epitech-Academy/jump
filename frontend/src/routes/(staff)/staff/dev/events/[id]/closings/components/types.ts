import type { ClosingsRoster } from '$lib/domain/closingsRoster';

export type { ClosingRow } from '$lib/domain/closingsRoster';

/** One staff member with the number of closings they conducted, for the
 *  "Closings menés" leaderboard. */
export type StaffTally = {
  id: string;
  name: string;
  image: string | null;
  count: number;
};

/** The cohort payload streamed behind the page shell's `{#await}`: everything
 *  that needs the DB. Shared by the page load and `ClosingsResults` so the
 *  streamed shape and the consuming component can never drift. */
export type ClosingsCohort = ClosingsRoster & {
  topStaff: StaffTally[];
};
