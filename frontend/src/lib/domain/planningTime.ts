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

export function isDateKey(value: string): value is DateKey {
  return DATE_KEY_REGEX.test(value);
}

export function isWallClock(value: string): value is WallClock {
  return WALL_CLOCK_REGEX.test(value);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Bare wall-clock `HH:MM` → minutes since midnight. The timezone-free sibling
 * of `toMinutesOfDay`: use it for slots that carry a wall-clock string with no
 * associated instant (e.g. planning *templates*, which are dateless), where
 * pixel layout still needs minutes.
 */
export function wallClockToMinutes(time: WallClock): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Minutes since midnight → wall-clock `HH:MM`. Inverse of `wallClockToMinutes`. */
export function minutesToWallClock(minutes: number): WallClock {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

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

/** UTC instant → wall-clock `HH:MM` in the campus timezone. */
export function toWallClockTime(instant: Date | string, tz: string): WallClock {
  const z = fromDate(asDate(instant), tz);
  return `${pad2(z.hour)}:${pad2(z.minute)}`;
}

/**
 * UTC instant → minutes elapsed since midnight in the campus timezone.
 * Used for grid layout: pixel position depends on local hour, not UTC hour.
 */
export function toMinutesOfDay(instant: Date | string, tz: string): number {
  const z = fromDate(asDate(instant), tz);
  return z.hour * 60 + z.minute;
}

/**
 * Campus-local wall clock → UTC instant. Inverse of `toDateKey` + `toWallClockTime`.
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

/**
 * Calendar-arithmetic addition of N days to a date key. DST-safe: operates on
 * the calendar field, not on a UTC instant, so a +1 day across a DST boundary
 * still lands on the next calendar day.
 */
export function addDays(dateKey: DateKey, days: number): DateKey {
  if (!isDateKey(dateKey)) {
    throw new Error(`Invalid date key: ${dateKey} (expected YYYY-MM-DD)`);
  }
  const next = parseDate(dateKey).add({ days });
  return `${next.year}-${pad2(next.month)}-${pad2(next.day)}`;
}

/** Day-of-month component of a date key (1–31). */
export function dayOfMonth(dateKey: DateKey): number {
  return Number(dateKey.slice(8, 10));
}
