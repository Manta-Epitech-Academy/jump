import { now } from '@internationalized/date';
import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { devVisibleEventWhere } from '$lib/server/services/stageContext';

// Single source for the attended-event row: the type below is derived from this
// select so the two can't drift. Only the fields the history actually renders
// (the name, via `eventDisplayName`, and the date) belong here.
const ATTENDED_EVENT_SELECT = {
  id: true,
  titre: true,
  date: true,
  publicName: true,
} satisfies Prisma.EventSelect;

export type AttendedEvent = Prisma.EventGetPayload<{
  select: typeof ATTENDED_EVENT_SELECT;
}>;

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
 * Only events visible in the dev workspace (`devVisibleEventWhere`) are
 * surfaced: an attended event stays out of history until an admin activates it
 * in the dev space, the same gate the dev event switcher uses. Callers render
 * the name via `eventDisplayName` (the admin-set `publicName`, else the SF
 * `titre`).
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
      ...devVisibleEventWhere,
      date: { lte: until },
      eventPresences: {
        some: { talentId, status: { in: ['present', 'late'] } },
      },
    },
    select: ATTENDED_EVENT_SELECT,
    orderBy: { date: 'desc' },
    ...(take !== undefined ? { take } : {}),
  });
}
