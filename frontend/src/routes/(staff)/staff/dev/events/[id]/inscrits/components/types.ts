import type { InterviewRecommendation, Prisma } from '@prisma/client';
import type { InterviewDisplayStatus } from '$lib/domain/interview';

export const FILTER_KEYS = [
  'all',
  'never-logged',
  'profile-incomplete',
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export type Sort = 'alpha' | 'xp' | 'events';

type ParticipationPrep = Prisma.ParticipationGetPayload<{
  include: {
    talent: {
      include: {
        lycee: true;
        interests: { include: { interest: true } };
      };
    };
  };
}>;

type ParticipationOngoing = Prisma.ParticipationGetPayload<{
  include: {
    talent: {
      include: {
        lycee: true;
        interests: { include: { interest: true } };
      };
    };
    interview: {
      select: {
        id: true;
        status: true;
        date: true;
        recommendation: true;
      };
    };
  };
}>;

type OnboardingState = {
  hasAccount: boolean;
  hasFirstLogin: boolean;
  hasCompletedProfile: boolean;
};

export type PrepRow = OnboardingState & {
  participation: ParticipationPrep;
};

export type OngoingRow = {
  participation: ParticipationOngoing;
  interviewStatus: InterviewDisplayStatus;
  interviewDate: Date | null;
  interviewRecommendation: InterviewRecommendation | null;
  lastActivityName: string | null;
  lastActivityAt: Date | null;
};

export type PastRow = OngoingRow;

export type FilterCounts = {
  all: number;
  neverLogged: number;
  profileIncomplete: number;
};
