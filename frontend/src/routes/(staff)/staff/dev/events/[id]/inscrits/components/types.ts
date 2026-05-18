import type { InterviewRecommendation, Prisma } from '@prisma/client';
import type { InterviewDisplayStatus } from '$lib/domain/interview';

export type Sort = 'alpha' | 'xp' | 'events';

type ParticipationPrep = Prisma.ParticipationGetPayload<{
  include: {
    talent: {
      include: {
        interests: { include: { interest: true } };
      };
    };
  };
}>;

type ParticipationOngoing = Prisma.ParticipationGetPayload<{
  include: {
    talent: {
      include: {
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

export type PrepRow = {
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
