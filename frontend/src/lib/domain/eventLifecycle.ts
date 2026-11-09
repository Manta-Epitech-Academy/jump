import { fromDate } from '@internationalized/date';

/**
 * Single source of truth for "is an event upcoming, ongoing, or past".
 *
 * An event has a `date` (start) and an optional `endDate` (multi-day).
 * When `endDate` is null the event is treated as single-day: it occupies the
 * calendar day of `date` (in the campus timezone).
 *
 * The answer is decided by CALENDAR DAY, never by instant. An event is ongoing
 * on every campus day its window touches, from the first minute of its first
 * day to the last minute of its last one. Comparing instants instead got both
 * ends wrong: a `date` stored at UTC midnight made a Paris event read
 * « à venir » until 02:00 on its own day, and an `endDate` written at UTC
 * midnight read « passé » from the first minute of its last day.
 *
 * Because day boundaries are timezone-dependent, callers compute the bounds
 * once for the campus with `getLifecycleBounds` and pass them in.
 */
export type EventLifecycleStatus = 'upcoming' | 'ongoing' | 'past';

export type LifecycleBounds = {
  /** Start of the campus's calendar day containing `at`. */
  startOfDay: Date;
  /** End of the campus's calendar day containing `at`. */
  endOfDay: Date;
};

export function getLifecycleBounds(
  timezone: string,
  at: Date = new Date(),
): LifecycleBounds {
  const zoned = fromDate(at, timezone);
  return {
    startOfDay: zoned
      .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
      .toDate(),
    endOfDay: zoned
      .set({ hour: 23, minute: 59, second: 59, millisecond: 999 })
      .toDate(),
  };
}

export function getEventStatus(
  event: { date: Date; endDate: Date | null },
  b: LifecycleBounds,
): EventLifecycleStatus {
  const end = event.endDate ?? event.date;
  if (end.getTime() < b.startOfDay.getTime()) return 'past';
  if (event.date.getTime() > b.endOfDay.getTime()) return 'upcoming';
  return 'ongoing';
}

/**
 * Returns the override when present, otherwise the real status. Pure helper:
 * the call site decides whether an override is in scope (e.g. dev impersonation).
 * Keeping this separate from {@link getEventStatus} preserves that function as
 * a domain primitive with no awareness of UI/session concerns.
 */
export function applyPhaseOverride(
  real: EventLifecycleStatus,
  override: EventLifecycleStatus | null | undefined,
): EventLifecycleStatus {
  return override ?? real;
}

const NBSP = ' ';
const MINUTE_MS = 60_000;

/**
 * The wait before an event opens, as its home's header says it: « Ouverture
 * dans 7 j 4 h », « dans 7 j » on the hour, « dans 19 h » once under a day,
 * « dans 42 min » under an hour, « imminente » once the hour has come on a page
 * left open. A unit at zero is left out rather than written « 0 j » or « 01 h »:
 * the line is read, not compared like a clock. Rounded up to the minute, so it
 * never says « 0 min » while the event is still to open.
 */
export function openingCountdownLine(remainingMs: number): string {
  const totalMinutes = Math.ceil(Math.max(0, remainingMs) / MINUTE_MS);
  if (totalMinutes === 0) return 'Ouverture imminente';
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts =
    days > 0
      ? [`${days}${NBSP}j`, ...(hours > 0 ? [`${hours}${NBSP}h`] : [])]
      : hours > 0
        ? [`${hours}${NBSP}h`]
        : [`${minutes}${NBSP}min`];
  return `Ouverture dans ${parts.join(' ')}`;
}
