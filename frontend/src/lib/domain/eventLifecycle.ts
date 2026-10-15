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
 * ends wrong: Salesforce stores `date` at UTC midnight, so a Paris event read
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
