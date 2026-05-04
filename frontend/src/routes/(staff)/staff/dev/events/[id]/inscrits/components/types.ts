import type { Prisma } from '@prisma/client';

export type ParticipationWithTalent = Prisma.ParticipationGetPayload<{
  include: { talent: true };
}>;

export type LastEvent = { titre: string; date: Date };

export type InscritRow = {
  participation: ParticipationWithTalent;
  lastEvent: LastEvent | null;
};

export type Sort = 'alpha' | 'xp' | 'lastEvent' | 'events';
