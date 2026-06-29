import { now } from '@internationalized/date';
import { prisma } from '$lib/server/db';

export type AttendedEvent = {
  id: string;
  titre: string;
  date: Date;
  eventType: string;
};

/**
 * Past events a talent actually attended, newest first.
 *
 * Attendance comes from `EventPresence` (the dev émargement feature), the only
 * presence source in use: `Participation.isPresent` is written solely by the
 * deprecated pedago cockpit, never exercised in prod, so it stays `false` on
 * real data and keying off it showed an empty history for everyone. "Attended"
 * means at least one présent / en-retard slot; filtering on `eventPresences.some`
 * also dedups multi-créneau events to one row per event.
 *
 * "Past" is the end of today in `timeZone` (the talent's own zone on the
 * portal, the campus zone on the staff fiche) so an event near midnight lands
 * in the same bucket on a UTC pod and in the browser. `take` caps the result
 * for the dashboard widget; omit it for the full timeline and the fiche.
 */
export function listAttendedEvents(
  talentId: string,
  { timeZone, take }: { timeZone: string; take?: number },
): Promise<AttendedEvent[]> {
  const until = now(timeZone)
    .set({ hour: 23, minute: 59, second: 59, millisecond: 999 })
    .toDate();

  return prisma.event.findMany({
    where: {
      date: { lte: until },
      eventPresences: {
        some: { talentId, status: { in: ['present', 'late'] } },
      },
    },
    select: { id: true, titre: true, date: true, eventType: true },
    orderBy: { date: 'desc' },
    ...(take !== undefined ? { take } : {}),
  });
}
