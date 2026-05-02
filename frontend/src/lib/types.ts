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

/** Planning with nested time slots and their single activity. */
export type PlanningWithSlots = Prisma.PlanningGetPayload<{
  include: {
    timeSlots: {
      include: {
        activity: {
          include: {
            subjectVersion: {
              select: {
                id: true;
                _count: { select: { sections: { where: { level: 1 } } } };
              };
            };
          };
        };
      };
    };
  };
}>;

/** TimeSlot with its activity, including a count of GitHub-backed sections. */
export type TimeSlotWithActivity = Prisma.TimeSlotGetPayload<{
  include: {
    activity: {
      include: {
        subjectVersion: {
          select: {
            id: true;
            _count: { select: { sections: { where: { level: 1 } } } };
          };
        };
      };
    };
  };
}>;
