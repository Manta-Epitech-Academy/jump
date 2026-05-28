import { fromDate, CalendarDateTime, toZoned } from '@internationalized/date';

/**
 * Compose an event's real start instant from its SF-owned calendar day
 * (`Event.date`) and its Jump-owned wall-clock time (`Event.startMinutes`),
 * resolved in the campus timezone.
 *
 * `startMinutes` is a tz-agnostic wall-clock value ("10:00 means 10:00 there"),
 * so we read the day off `date` *in the campus zone*, graft the chosen
 * hour/minute onto it, then convert back to an absolute instant — letting
 * `@internationalized/date` handle DST correctly. Returns `date` unchanged when
 * no start time has been set yet.
 */
export function composeEventStartInstant(
  date: Date,
  startMinutes: number | null,
  timezone: string,
): Date {
  if (startMinutes == null) return date;
  const day = fromDate(date, timezone);
  const local = new CalendarDateTime(
    day.year,
    day.month,
    day.day,
    Math.floor(startMinutes / 60),
    startMinutes % 60,
  );
  return toZoned(local, timezone).toDate();
}
