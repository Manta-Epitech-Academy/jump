import type { InterviewRecommendation, Prisma } from '@prisma/client';
import type { InterviewDisplayStatus } from '$lib/domain/interview';

export type Sort = 'alpha' | 'xp' | 'events';

type ParticipationPrep = Prisma.ParticipationGetPayload<{
  include: {
    talent: {
      include: {
        interests: { include: { interest: true } };
        school: { select: { id: true; name: true; city: true } };
      };
    };
  };
}>;

type ParticipationOngoing = Prisma.ParticipationGetPayload<{
  include: {
    talent: {
      include: {
        interests: { include: { interest: true } };
        school: { select: { id: true; name: true; city: true } };
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
  isNewTalent: boolean;
  lastSeenName: string | null;
  lastSeenAt: Date | null;
};

export type OngoingRow = {
  participation: ParticipationOngoing;
  isNewTalent: boolean;
  interviewStatus: InterviewDisplayStatus;
  interviewDate: Date | null;
  interviewRecommendation: InterviewRecommendation | null;
  lastActivityName: string | null;
  lastActivityAt: Date | null;
};

/**
 * "Nouveau" tag = this stage is the talent's first ever at Epitech.
 * `eventsCount` is bumped on `markPresent`, so we must subtract the
 * current event's presence to recover the "before this stage" count.
 */
export function computeIsNewTalent(p: {
  isPresent: boolean;
  talent: { eventsCount: number } | null;
}): boolean {
  const count = p.talent?.eventsCount ?? 0;
  return count - (p.isPresent ? 1 : 0) <= 0;
}

export type PastRow = OngoingRow;
