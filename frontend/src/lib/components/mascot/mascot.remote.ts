import { z } from 'zod';
import { gatedCommand } from '#lib/server/remoteFunctions.ts';
import {
  setMascotAsleep,
  setMascotLook,
} from '#lib/server/services/mascotService.ts';
import { mascotChoiceSchema } from '#lib/validation/mascot.ts';

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

/**
 * « Mon EpiDuck » in the settings (#539): the whole choice on every change,
 * scoped to the caller's own talent. The controller sends them one at a time,
 * in the order they were made (#552), so the last one stored is the last one
 * chosen.
 */
export const saveMascotLook = gatedCommand(
  { talent: 'appOpen' },
  mascotChoiceSchema,
  (choice, { talent }) => setMascotLook(talent.id, choice),
);
