import { now as nowInTimezone } from '@internationalized/date';

/**
 * Single source of truth for "is an event upcoming, ongoing, or past".
 *
 * An event has a `date` (start) and an optional `endDate` (multi-day).
 * When `endDate` is null the event is treated as single-day: it occupies the
 * calendar day of `date` (in the campus timezone).
 *
 * Because day boundaries are timezone-dependent, callers compute the bounds
 * once for the campus with `getLifecycleBounds` and pass them in.
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
