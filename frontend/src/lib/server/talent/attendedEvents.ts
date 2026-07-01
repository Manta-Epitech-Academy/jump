import type { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import {
  devVisibleEventWhere,
  resolveEventStatus,
} from '$lib/server/services/stageContext';
import { getLifecycleBounds } from '$lib/domain/eventLifecycle';

// Single source for the attended-event row: the type below is derived from this
// select so the two can't drift. Beyond the fields the history renders (the
// name, via `eventDisplayName`, and the date), the select carries `endDate` and
// `eventType` because the "past" filter runs them through `resolveEventStatus`
// (a running stage with no endDate must not read `past`); see below.
const ATTENDED_EVENT_SELECT = {
  id: true,
  titre: true,
  date: true,
  endDate: true,
  eventType: true,
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
 * "Past" is decided by `resolveEventStatus` in `timeZone` (the talent's own
 * zone on the portal, the campus zone on the staff fiche), the same lens the
 * dev switcher and the admin cockpit use, so the three agree on when an event
 * is over. This matters for a stage de seconde with no `endDate`: a raw
 * `date < now` check would surface it the day after it starts, while the talent
 * is still mid-stage; `resolveEventStatus` gives it its ~2-week window instead.
 * The attended-with-presence set is small (a few rows per talent), so filtering
 * in memory rather than in the query keeps that synthesized window in one place.
 * `take` caps the result for the dashboard widget, applied AFTER the past filter
 * so a still-running stage can't eat a slot; omit it for the timeline and fiche.
 */
export async function listAttendedEvents(
  talentId: string,
  { timeZone, take }: { timeZone: string; take?: number },
): Promise<AttendedEvent[]> {
  const rows = await prisma.event.findMany({
    where: {
      ...devVisibleEventWhere,
      eventPresences: {
        some: { talentId, status: { in: ['present', 'late'] } },
      },
    },
    select: ATTENDED_EVENT_SELECT,
    orderBy: { date: 'desc' },
  });

  const bounds = getLifecycleBounds(timeZone);
  const past = rows.filter((e) => resolveEventStatus(e, bounds) === 'past');
  return take === undefined ? past : past.slice(0, take);
}
