import { z } from 'zod';
import { gatedCommand } from '#lib/server/remoteFunctions.ts';
import { setMascotAsleep } from '#lib/server/services/mascotService.ts';

/**
 * The header's sleep button (#539). Page-agnostic, since the duck is on every
 * talent page, and scoped to the caller's own talent. Setting a state rather
 * than toggling one, so a double click or a stale tab lands where it meant to.
 */
export const putMascotToSleep = gatedCommand(
  { talent: 'appOpen' },
  z.object({ asleep: z.boolean() }),
  ({ asleep }, { talent }) => setMascotAsleep(talent.id, asleep),
);
