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
