import { fromDate, CalendarDateTime, toZoned } from '@internationalized/date';

/**
 * The absolute instant at which a wall-clock time (minutes past local midnight)
 * falls on a given calendar day, resolved in `timezone`. The day is passed as
 * its raw calendar components, never as a `Date`: an absolute instant can't
 * stand in for a calendar day on its own, and reconstructing one from UTC
 * midnight lands a day early in any negative-offset zone. `@internationalized/date`
 * handles the DST-aware conversion. The shared core of every "campus wall clock
 * to instant" calculation below.
 */
export function zonedWallClockInstant(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timezone: string,
): Date {
  const local = new CalendarDateTime(
    year,
    month,
    day,
    Math.floor(minutes / 60),
    minutes % 60,
  );
  return toZoned(local, timezone).toDate();
}

/**
 * Compose an event's real start instant from its SF-owned calendar day
 * (`Event.date`) and its Jump-owned wall-clock time (`Event.startMinutes`),
 * resolved in the campus timezone.
 *
 * `startMinutes` is a tz-agnostic wall-clock value ("10:00 means 10:00 there"),
 * so we read the day off `date` *in the campus zone*, then graft the chosen
 * hour/minute onto it. Returns `date` unchanged when no start time has been set
 * yet.
 */
export function composeEventStartInstant(
  date: Date,
  startMinutes: number | null,
  timezone: string,
): Date {
  if (startMinutes == null) return date;
  const day = fromDate(date, timezone);
  return zonedWallClockInstant(
    day.year,
    day.month,
    day.day,
    startMinutes,
    timezone,
  );
}
