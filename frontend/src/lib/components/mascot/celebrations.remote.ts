import { gatedCommand } from '#lib/server/remoteFunctions.ts';
import { markCelebrationsPlayed } from '#lib/server/talent/celebrations.ts';
import { celebrationAckSchema } from '#lib/validation/celebrations.ts';

/**
 * The celebrations' acknowledgement, sent by the duck's stage before it plays
 * them so leaving mid-animation never replays one. Page-agnostic on purpose:
 * the stage is mounted wherever the talent may land (the home, the
 * leaderboard, the play page). Scoped to the caller's own talent.
 *
 * An admin looking through the talent's session marks nothing played (#540,
 * AC10): what they saw was a preview, and the talent's own celebration is
 * still to come.
 */
export const ackCelebrations = gatedCommand(
  { talent: 'appOpen' },
  celebrationAckSchema,
  async (ack, { talent, impersonated }) => {
    if (impersonated) return;
    await markCelebrationsPlayed(talent.id, ack);
  },
);
