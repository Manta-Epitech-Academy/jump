import type { InterviewRecommendation } from '@prisma/client';
import type { InterviewListStatus } from '$lib/domain/interview';

/** One row of the Entretiens list: a stage participant plus their interview (if
 *  any). Absence of an interview is the "à faire" status. */
export type EntretienRow = {
  participationId: string;
  talentId: string;
  nom: string;
  prenom: string;
  status: InterviewListStatus;
  staffName: string | null;
  staffImage: string | null;
  conductedAt: Date | string | null;
  recommendation: InterviewRecommendation | null;
};

export type SortKey = 'prenom' | 'nom' | 'staff' | 'date' | 'status';

/** One staff member with the number of entretiens they conducted, for the
 *  "Entretiens menés" leaderboard. */
export type StaffTally = {
  id: string;
  name: string;
  image: string | null;
  count: number;
};

/** Status buckets for the synthesis card. */
export type InterviewCounts = {
  todo: number;
  in_progress: number;
  done: number;
};

/** Recommendation breakdown over finalized interviews. */
export type RecoCounts = Record<InterviewRecommendation, number>;

/** The cohort payload streamed behind the page shell's `{#await}` — everything
 *  that needs the DB. Shared by the page load and `EntretiensResults` so the
 *  streamed shape and the consuming component can never drift. */
export type EntretiensCohort = {
  rows: EntretienRow[];
  counts: InterviewCounts;
  recoCounts: RecoCounts;
  topStaff: StaffTally[];
  total: number;
};
