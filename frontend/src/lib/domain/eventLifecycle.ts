import type { Prisma } from '@prisma/client';
import { now as nowInTimezone } from '@internationalized/date';

/**
 * Single source of truth for "is an event upcoming, ongoing, or past".
 *
 * An event has a `date` (start) and an optional `endDate` (multi-day).
 * When `endDate` is null the event is treated as single-day: it occupies the
 * calendar day of `date` (in the campus timezone).
 *
 * Because day boundaries are timezone-dependent, callers compute the bounds
 * once for the campus and pass them in. The three Prisma helpers below
 * partition the event space disjointly given the same bounds.
 */
export type EventLifecycleStatus = 'upcoming' | 'ongoing' | 'past';

export type LifecycleBounds = {
  /** Current instant. */
  now: Date;
  /** Start of the campus's current calendar day. */
  startOfDay: Date;
  /** End of the campus's current calendar day. */
  endOfDay: Date;
};

export function getLifecycleBounds(timezone: string): LifecycleBounds {
  const tzNow = nowInTimezone(timezone);
  return {
    now: tzNow.toDate(),
    startOfDay: tzNow
      .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
      .toDate(),
    endOfDay: tzNow
      .set({ hour: 23, minute: 59, second: 59, millisecond: 999 })
      .toDate(),
  };
}

export function ongoingEventWhere(b: LifecycleBounds): Prisma.EventWhereInput {
  return {
    OR: [
      { date: { lte: b.now }, endDate: { gte: b.now } },
      { endDate: null, date: { gte: b.startOfDay, lte: b.endOfDay } },
    ],
  };
}

export function upcomingEventWhere(b: LifecycleBounds): Prisma.EventWhereInput {
  return {
    OR: [
      { date: { gt: b.now }, endDate: { not: null } },
      { endDate: null, date: { gt: b.endOfDay } },
    ],
  };
}

export function pastEventWhere(b: LifecycleBounds): Prisma.EventWhereInput {
  return {
    OR: [
      { endDate: { lt: b.now } },
      { endDate: null, date: { lt: b.startOfDay } },
    ],
  };
}

/**
 * Events overlapping `[rangeStart, rangeEnd]`. Used for week-window task
 * derivations where a multi-day event that started earlier still needs
 * mantas/planning attention this week.
 */
export function eventOverlappingWhere(
  rangeStart: Date,
  rangeEnd: Date,
): Prisma.EventWhereInput {
  return {
    date: { lte: rangeEnd },
    OR: [
      { endDate: { gte: rangeStart } },
      { endDate: null, date: { gte: rangeStart } },
    ],
  };
}

export function getEventStatus(
  event: { date: Date; endDate: Date | null },
  b: LifecycleBounds,
): EventLifecycleStatus {
  if (event.endDate) {
    if (event.endDate.getTime() < b.now.getTime()) return 'past';
    if (event.date.getTime() > b.now.getTime()) return 'upcoming';
    return 'ongoing';
  }
  if (event.date.getTime() < b.startOfDay.getTime()) return 'past';
  if (event.date.getTime() > b.endOfDay.getTime()) return 'upcoming';
  return 'ongoing';
}
