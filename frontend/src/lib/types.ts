import type { Prisma } from '@prisma/client';

/** One programme slot: when it runs, and what runs then. */
export type PlanningSlot = Prisma.Planning_SlotGetPayload<object>;
