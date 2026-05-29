import type { InterviewRecommendation, Prisma } from '@prisma/client';
import type { InterviewDisplayStatus } from '$lib/domain/interview';

export type Sort = 'alpha' | 'xp' | 'events';

// Single source of truth for the talent fields the inscrit cards, search and
// sort actually read. Kept lean on purpose: the cohort fetch (~200 rows) must
// not drag the full Talent row (incl. Salesforce-mirror columns) or full
// Interest rows. The server load imports these selects so the query and the
// row types below can never drift.
export const TALENT_CARD_SELECT = {
  id: true,
  nom: true,
  prenom: true,
  niveau: true,
  xp: true,
  eventsCount: true,
  email: true,
  parentEmail: true,
  school: { select: { id: true, name: true, city: true } },
  interests: {
    select: {
      interestId: true,
      interest: { select: { id: true, nom: true, emoji: true } },
    },
  },
} satisfies Prisma.TalentSelect;

export const PREP_PARTICIPATION_SELECT = {
  id: true,
  isPresent: true,
  talentId: true,
  talent: { select: TALENT_CARD_SELECT },
} satisfies Prisma.ParticipationSelect;

export const ONGOING_PARTICIPATION_SELECT = {
  id: true,
  isPresent: true,
  talentId: true,
  talent: { select: TALENT_CARD_SELECT },
  interview: {
    select: {
      id: true,
      status: true,
      date: true,
      recommendation: true,
    },
  },
} satisfies Prisma.ParticipationSelect;

type ParticipationPrep = Prisma.ParticipationGetPayload<{
  select: typeof PREP_PARTICIPATION_SELECT;
}>;

type ParticipationOngoing = Prisma.ParticipationGetPayload<{
  select: typeof ONGOING_PARTICIPATION_SELECT;
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
