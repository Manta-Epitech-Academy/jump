import { z } from 'zod';
import { workshopRewardAckSchema } from './workshops';

/**
 * What the duck's stage sends back once it has shown the talent's pending
 * celebrations (`PendingCelebrations.ack`), unchanged: the activity amounts on
 * screen, which challenge rewards, and the XP total the level was shown at.
 * Every mark it raises only rises, so an inflated value can only silence this
 * talent's own celebration.
 */
export const celebrationAckSchema = z.object({
  workshopUpTo: workshopRewardAckSchema.shape.upTo.optional(),
  minigame: z.array(z.enum(['base', 'rank'])).max(2),
  levelUpTo: z.number().int().min(0).optional(),
});

export type CelebrationAck = z.infer<typeof celebrationAckSchema>;
