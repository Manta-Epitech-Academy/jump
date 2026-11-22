import { z } from 'zod';
import { gatedCommand } from '#lib/server/remoteFunctions.ts';
import { markWorkshopRewardsSeen } from '#lib/server/services/workshopService.ts';
import {
  markMinigameRewardsSeen,
  markMinigameRankRewardsSeen,
} from '#lib/server/services/minigameService.ts';
import { workshopRewardAckSchema } from '#lib/validation/workshops.ts';

/**
 * The XP celebrations' acknowledgements. Page-agnostic on purpose: the
 * celebration components are mounted wherever the talent may land (dashboard,
 * leaderboard), so they acknowledge here rather than through a page action.
 * Scoped to the caller's own talent, and each mark only ever rises, so a double
 * call or a stale tab is harmless.
 */

/**
 * Activity XP celebrated, up to what the dashboard showed. The amounts that
 * were on screen rather than "everything", so XP arriving during the animation
 * stays owed.
 */
export const ackWorkshopRewards = gatedCommand(
  { talent: 'appOpen' },
  workshopRewardAckSchema,
  ({ upTo }, { talent }) => markWorkshopRewardsSeen(talent.id, upTo),
);

/** The minigame reward floats shown, so each fires exactly once. */
export const ackMinigameRewards = gatedCommand(
  { talent: 'appOpen' },
  z.object({ kinds: z.array(z.enum(['base', 'rank'])).max(2) }),
  async ({ kinds }, { talent }) => {
    if (kinds.includes('base')) await markMinigameRewardsSeen(talent.id);
    if (kinds.includes('rank')) await markMinigameRankRewardsSeen(talent.id);
  },
);
