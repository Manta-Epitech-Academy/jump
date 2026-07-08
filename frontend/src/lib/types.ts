import type { Prisma } from '@prisma/client';

/** TimeSlot with its single activity. */
export type TimeSlotWithActivity = Prisma.TimeSlotGetPayload<{
  include: { activity: true };
}>;
