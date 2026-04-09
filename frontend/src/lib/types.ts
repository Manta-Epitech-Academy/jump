import type { Prisma } from '@prisma/client';

/** Participation with its student profile and assigned subjects. */
export type ParticipationWithDetails = Prisma.ParticipationGetPayload<{
  include: {
    studentProfile: true;
    subjects: { include: { subject: true } };
  };
}>;

/** Participation with event and assigned subjects (for mission history). */
export type ParticipationWithEvent = Prisma.ParticipationGetPayload<{
  include: {
    event: true;
    subjects: { include: { subject: true } };
  };
}>;

/** Participation with deep subject→theme chain (for theme tallying). */
export type ParticipationWithThemes = Prisma.ParticipationGetPayload<{
  include: {
    subjects: {
      include: {
        subject: {
          include: {
            subjectThemes: { include: { theme: true } };
          };
        };
      };
    };
  };
}>;

/** Participation with event + deep subject→theme chain (for certificates). */
export type ParticipationWithEventAndThemes = Prisma.ParticipationGetPayload<{
  include: {
    event: true;
    subjects: {
      include: {
        subject: {
          include: {
            subjectThemes: { include: { theme: true } };
          };
        };
      };
    };
  };
}>;

/** Subject with its theme associations and optional campus. */
export type SubjectWithThemes = Prisma.SubjectGetPayload<{
  include: {
    subjectThemes: { include: { theme: true } };
    campus: true;
  };
}>;
