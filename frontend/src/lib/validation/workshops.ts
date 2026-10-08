import { z } from 'zod';

/**
 * What the dashboard sends back once it has celebrated activity XP: the
 * `upTo` of the `WorkshopReward` it was given, unchanged. Bounded because a
 * talent is offered a handful of activities, never hundreds.
 */
export const workshopRewardAckSchema = z.object({
  upTo: z
    .array(
      z.object({
        activityId: z.string().min(1),
        amount: z.number().int().min(0),
      }),
    )
    .max(100),
});
