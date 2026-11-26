/**
 * EpiDuck on the talent's side (#539): what he may say today, how the talent
 * dressed him and whether they put him to sleep. What he says is authored over
 * the admin API (`adminApi/writes/mascot.ts`); his look and his sleep are the
 * talent's to write, from the settings and the header (`mascot.remote.ts`).
 */

import { prisma } from '#lib/server/db.ts';
import { dateKeyToDbDate } from '#lib/domain/eventPresence.ts';
import { toDateKey, type DateKey } from '#lib/domain/planningTime.ts';
import { eventPublicName, UNNAMED_EVENT_NAME } from '#lib/domain/event.ts';
import {
  isMascotMoment,
  type EnrolledEventDays,
  type MascotChoice,
  type MascotVoice,
} from '#lib/domain/mascot.ts';
import { enrolledNotOverWhere } from './talentHomeHero';

/** How far ahead an event's first day may be for the duck to mention it. */
const EVENT_NEWS_HORIZON_MS = 2 * 24 * 60 * 60 * 1000;

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
 * Stores how the talent dressed their duck, whole: every save carries the full
 * choice, so the last one written is the duck. An empty name stores null,
 * which is his own name.
 */
export async function setMascotLook(
  talentId: string,
  choice: MascotChoice,
): Promise<void> {
  await prisma.talent.update({
    where: { id: talentId },
    data: {
      mascotName: choice.name || null,
      mascotGlasses: choice.glasses,
      mascotScarf: choice.scarf,
      mascotHair: choice.hair,
    },
  });
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

/**
 * The events the talent is enrolled in that start within two days and are not
 * over, each with its days and today read on its own campus clock, for the
 * duck to say an event is tomorrow or today (#540). The same enrolments the
 * home's hero calls « inscrit » (`enrolledNotOverWhere`), so the duck never
 * announces an event the home does not show; which one is worth a line is the
 * domain's (`arrivalCues`).
 */
export async function loadEventDays(
  talentId: string,
  now: Date = new Date(),
): Promise<EnrolledEventDays[]> {
  const rows = await prisma.participation.findMany({
    where: {
      AND: [
        enrolledNotOverWhere(talentId, now),
        {
          event: {
            date: { lte: new Date(now.getTime() + EVENT_NEWS_HORIZON_MS) },
          },
        },
      ],
    },
    select: {
      event: {
        select: {
          publicName: true,
          date: true,
          endDate: true,
          campus: { select: { timezone: true } },
        },
      },
    },
  });
  return rows.map(({ event }) => {
    const timezone = event.campus.timezone;
    const date = toDateKey(event.date, timezone);
    return {
      name: eventPublicName(event) ?? UNNAMED_EVENT_NAME,
      date,
      endDate: event.endDate ? toDateKey(event.endDate, timezone) : date,
      today: toDateKey(now, timezone),
    };
  });
}
