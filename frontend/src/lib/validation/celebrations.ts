import { z } from 'zod';
import { workshopRewardAckSchema } from './workshops';

/**
 * What the duck's stage sends back once it has queued celebrations: the marks
 * of the items it is about to play, and of no other (`ackOf`). The activity
 * amounts on screen; each challenge reward by the publication its attempt
 * belongs to (one attempt per talent and publication), marked with every
 * earlier one; and the XP total the level was shown at. Every mark it raises
 * only rises, so an inflated value can only silence this talent's own
 * celebration.
 */
export const celebrationAckSchema = z.object({
  workshopUpTo: workshopRewardAckSchema.shape.upTo.optional(),
  daily: z.string().min(1).optional(),
  rank: z.string().min(1).optional(),
  levelUpTo: z.number().int().min(0).optional(),
});

export type CelebrationAck = z.infer<typeof celebrationAckSchema>;
