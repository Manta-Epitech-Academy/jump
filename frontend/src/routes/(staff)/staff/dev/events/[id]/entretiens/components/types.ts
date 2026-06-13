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
  interviewerName: string | null;
  interviewerImage: string | null;
  conductedAt: Date | string | null;
  recommendation: InterviewRecommendation | null;
};

export type SortKey = 'prenom' | 'nom' | 'interviewer' | 'date' | 'status';

export type TopInterviewer = {
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
  topInterviewers: TopInterviewer[];
  total: number;
};
