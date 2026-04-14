import type { Prisma } from '@prisma/client';

/** Participation with its student profile. */
export type ParticipationWithDetails = Prisma.ParticipationGetPayload<{
  include: {
    studentProfile: true;
  };
}>;

/** Participation with event→planning→timeSlots→activities (for today's timeline). */
export type ParticipationWithPlanning = Prisma.ParticipationGetPayload<{
  include: {
    event: {
      include: {
        planning: {
          include: {
            timeSlots: {
              include: { activities: true };
            };
          };
        };
      };
    };
  };
}>;

/** Participation with activities→activityThemes→theme (for theme tallying). */
export type ParticipationWithActivityThemes = Prisma.ParticipationGetPayload<{
  include: {
    event: true;
    activities: {
      include: {
        activity: {
          include: {
            activityThemes: { include: { theme: true } };
          };
        };
      };
    };
  };
}>;

/** Planning with nested time slots and their activities. */
export type PlanningWithSlots = Prisma.PlanningGetPayload<{
  include: {
    timeSlots: {
      include: { activities: true };
    };
  };
}>;

/** TimeSlot with its activities. */
export type TimeSlotWithActivities = Prisma.TimeSlotGetPayload<{
  include: { activities: true };
}>;
