import { CalendarDateTime, fromDate, parseDate } from '@internationalized/date';

// Planning slots are stored as UTC instants in the DB but always *meant* in
// the campus's wall-clock time — drag a slot at 14:00, the staff means 14:00
// at their campus, regardless of where they happen to be browsing from. These
// helpers are the single place that bridges the two representations.
//
// Anything that touches a slot's start/end (server actions, drag handlers,
// pixel layout) must go through here. Calling `Date.getHours()` directly
// silently uses the browser's TZ, which is the bug class this module exists
// to prevent.

/** Calendar day in the campus timezone, ISO 8601 format `YYYY-MM-DD`. */
export type DateKey = string;

/** Wall-clock time of day, format `HH:MM` (24h). */
export type WallClock = string;

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const WALL_CLOCK_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function isDateKey(value: string): value is DateKey {
  return DATE_KEY_REGEX.test(value);
}

function isWallClock(value: string): value is WallClock {
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
