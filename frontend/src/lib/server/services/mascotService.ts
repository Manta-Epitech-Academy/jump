/**
 * EpiDuck on the talent's side (#539): what he may say today, and whether the
 * talent put him to sleep. What he says is authored over the admin API
 * (`adminApi/writes/mascot.ts`); his look is written from the talent's
 * settings.
 */

import { prisma } from '#lib/server/db.ts';
import { dateKeyToDbDate } from '#lib/domain/eventPresence.ts';
import type { DateKey } from '#lib/domain/planningTime.ts';
import { isMascotMoment, type MascotVoice } from '#lib/domain/mascot.ts';

/**
 * The lines live on `day`, grouped by moment, each moment's in the order they
 * were written so a rotation is stable. Archived lines, lines outside their
 * window and lines of a retired moment are left out. Common to every campus.
 */
export async function loadMascotVoice(day: DateKey): Promise<MascotVoice> {
  const date = dateKeyToDbDate(day);
  const rows = await prisma.mascot_Line.findMany({
    where: {
      archivedAt: null,
      AND: [
        { OR: [{ startsOn: null }, { startsOn: { lte: date } }] },
        { OR: [{ endsOn: null }, { endsOn: { gte: date } }] },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { momentKey: true, text: true },
  });
  const voice: MascotVoice = {};
  for (const { momentKey, text } of rows) {
    if (!isMascotMoment(momentKey)) continue;
    (voice[momentKey] ??= []).push(text);
  }
  return voice;
}

/**
 * Puts the talent's duck to sleep or wakes him. Asleep keeps the first instant,
 * so a repeated call changes nothing; awake clears it.
 */
export async function setMascotAsleep(
  talentId: string,
  asleep: boolean,
): Promise<void> {
  await prisma.talent.updateMany({
    where: asleep
      ? { id: talentId, mascotAsleepAt: null }
      : { id: talentId, mascotAsleepAt: { not: null } },
    data: { mascotAsleepAt: asleep ? new Date() : null },
  });
}
