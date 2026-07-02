import type { Prisma } from '@prisma/client';

/** Participation with its student profile and stage compliance status. */
export type ParticipationWithDetails = Prisma.ParticipationGetPayload<{
  include: {
    talent: true;
    stageCompliance: true;
  };
}>;

/** Participation with event→planning→timeSlots→activity (for today's timeline). */
export type ParticipationWithPlanning = Prisma.ParticipationGetPayload<{
  include: {
    event: {
      include: {
        planning: {
          include: {
            timeSlots: {
              include: { activity: true };
            };
          };
        };
      };
    };
  };
}>;

/** Planning with nested time slots and their single activity. */
export type PlanningWithSlots = Prisma.PlanningGetPayload<{
  include: {
    timeSlots: {
      include: { activity: true };
    };
  };
}>;

/** TimeSlot with its single activity. */
export type TimeSlotWithActivity = Prisma.TimeSlotGetPayload<{
  include: { activity: true };
}>;
