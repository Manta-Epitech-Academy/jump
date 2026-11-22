/**
 * EpiDuck's lines beyond the ones its migration ships (#539).
 *
 * The defaults belong to the migration, so every environment has a talking duck
 * whether or not it was ever generated, and they are not restated here. What
 * the generator adds are the two states an admin's writes produce and no
 * migration does: a seasonal line, bounded to a window around the anchor so it
 * is live on the day the dataset describes, and an archived one, which the
 * duck no longer says.
 */

import type { PrismaClient } from '@prisma/client';
import { dateKeyToDbDate } from '../../../src/lib/domain/eventPresence';
import { toDateKey } from '../../../src/lib/domain/planningTime';
import type { Clock } from '../clock';
import { id } from '../ids';

/** Create-only: a line already present is left exactly as it stands. */
export async function seedMascotLines(
  prisma: PrismaClient,
  clock: Clock,
): Promise<number> {
  const day = (offset: number) =>
    dateKeyToDbDate(toDateKey(clock.days(offset), 'Europe/Paris'));
  const { count } = await prisma.mascot_Line.createMany({
    data: [
      {
        id: id('mln', 'saison'),
        momentKey: 'hello',
        text: 'Coin ! Il fait frais ce matin, {prenom}, pense à ton écharpe.',
        startsOn: day(-7),
        endsOn: day(7),
        createdAt: clock.days(-10),
        updatedAt: clock.days(-10),
      },
      {
        id: id('mln', 'archivee'),
        momentKey: 'poke',
        text: 'Une phrase que le canard ne dit plus.',
        archivedAt: clock.days(-30),
        createdAt: clock.days(-90),
        updatedAt: clock.days(-30),
      },
    ],
    skipDuplicates: true,
  });
  return count;
}
