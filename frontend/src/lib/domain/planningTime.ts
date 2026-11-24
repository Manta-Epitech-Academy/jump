import {
  CalendarDateTime,
  fromDate,
  getDayOfWeek,
  parseDate,
} from '@internationalized/date';

// Planning slots are stored as UTC instants in the DB but always *meant* in
// the campus's wall-clock time: drag a slot at 14:00, the staff means 14:00
// at their campus, regardless of where they happen to be browsing from. These
// helpers are the single place that bridges the two representations.
//
// Anything that touches a slot's start/end (server actions, drag handlers,
// pixel layout) must go through here. Calling `Date.getHours()` directly
// silently uses the browser's TZ, which is the bug class this module exists
// to prevent.
//
// Two clocks, then, and each question has one:
// - A campus fact (an activity at 9h, an event's day, a half-day of émargement,
//   when a talent answered) is read on the campus clock: the talent, the
//   parents, the team on site and the mails all say « 9h », and so does a
//   recruiter reading the planning from Montréal.
// - A line about the reader (the dev space's greeting) is read on the reader's
//   clock: the browser's timezone, kept in the `READER_TIMEZONE_COOKIE` by the
//   root layout and read back by `getReaderTimezone`, the campus's until then.
// Both are read in the `load`, so the server render and the page agree.

/**
 * The cookie the browser's timezone travels in, so a `load` can read the
 * reader's clock on the server render too. Set by the root layout.
 */
export const READER_TIMEZONE_COOKIE = 'tz';

/** Calendar day in the campus timezone, ISO 8601 format `YYYY-MM-DD`. */
export type DateKey = string;

/** Wall-clock time of day, format `HH:MM` (24h). */
export type WallClock = string;

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const WALL_CLOCK_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function isDateKey(value: string): value is DateKey {
  return DATE_KEY_REGEX.test(value);
}

/**
 * A real calendar day, not merely the right shape.
 *
 * The shape check alone is not enough for anything that accepts a day from
 * outside (a form, an API parameter): `2026-06-31` matches the regex, and the
 * built-in parser silently rolls it over to 1 July, so a caller who mistyped a
 * month length would get a confident answer about the wrong day. The strict
 * parser this module already uses rejects it instead, and this is the predicate
 * that lets a validator ask before {@link fromWallClock} has to throw.
 */
export function isCalendarDay(value: string): value is DateKey {
  if (!isDateKey(value)) return false;
  try {
    parseDate(value);
    return true;
  } catch {
    return false;
  }
}

/** Time of day, `HH:MM` on a 24h clock. Exported so validators share the rule. */
export function isWallClock(value: string): value is WallClock {
  return WALL_CLOCK_REGEX.test(value);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function asDate(instant: Date | string): Date {
  return instant instanceof Date ? instant : new Date(instant);
}

/**
 * UTC instant → the calendar day it falls on, in the campus timezone.
 * A 23:30 UTC instant on May 9 is `2026-05-10` for a UTC+1 campus.
 */
export function toDateKey(instant: Date | string, tz: string): DateKey {
  const z = fromDate(asDate(instant), tz);
  return `${z.year}-${pad2(z.month)}-${pad2(z.day)}`;
}

/**
 * Whole calendar days from `from` to `to`: negative when `to` comes first. Two
 * keys are two campus days already, so no timezone, daylight saving or runtime
 * clock can bend the count.
 */
export function daysBetween(from: DateKey, to: DateKey): number {
  return parseDate(to).compare(parseDate(from));
}

/**
 * The wall clock of a timezone at an instant: the hour (0 to 23), the minute and
 * the ISO weekday (1 Monday to 7 Sunday). The campus's for a campus fact, the
 * reader's for a greeting. `Date.getHours()` would answer in the server's
 * timezone on the server render and in the browser's on the client.
 */
export function clockAt(
  instant: Date | string,
  tz: string,
): { hour: number; minute: number; weekday: number } {
  const z = fromDate(asDate(instant), tz);
  return {
    hour: z.hour,
    minute: z.minute,
    weekday: getDayOfWeek(z, 'fr-FR') + 1,
  };
}

/**
 * Campus-local wall clock → UTC instant. Inverse of `toDateKey`.
 * Throws on malformed inputs so callers get a clean failure instead of a
 * silently shifted date.
 */
export function fromWallClock(
  dateKey: DateKey,
  time: WallClock,
  tz: string,
): Date {
  if (!isDateKey(dateKey)) {
    throw new Error(`Invalid date key: ${dateKey} (expected YYYY-MM-DD)`);
  }
  if (!isWallClock(time)) {
    throw new Error(`Invalid wall clock: ${time} (expected HH:MM)`);
  }
  const date = parseDate(dateKey);
  const [h, m] = time.split(':').map(Number);
  const cdt = new CalendarDateTime(date.year, date.month, date.day, h, m);
  return cdt.toDate(tz);
}
