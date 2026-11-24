/**
 * Pure date/week helpers shared by the planning calendars. The talent calendar
 * and the dev read-only viewer both lay slots onto a Monday-Sunday week grid and
 * page through weeks; this module is the single home for the week math so the two
 * surfaces can't drift. No Svelte, no DOM: just dates.
 *
 * Every day here is a campus `DateKey`, as in `campusCalendar.ts`. A slot's day
 * is read on the campus clock once (`toDateKey`), and from there no `Date`, so
 * no browser or pod timezone, can move an activity to another column: a 9h
 * workshop in Lille sits on its Lille day for a reader in Montréal too.
 */
import { getDayOfWeek, parseDate } from '@internationalized/date';
import { daysBetween, toDateKey, type DateKey } from './planningTime';

/** Monday 0 ... Sunday 6, whatever the runtime's locale. */
const weekdayOf = (day: DateKey) => getDayOfWeek(parseDate(day), 'fr-FR');

/** The Monday of the week holding `day`. */
export function mondayOf(day: DateKey): DateKey {
  return parseDate(day)
    .subtract({ days: weekdayOf(day) })
    .toString();
}

/** The same weekday `weeks` weeks later (earlier when negative). */
export function addWeeks(day: DateKey, weeks: number): DateKey {
  return parseDate(day).add({ weeks }).toString();
}

/** Whole weeks from the week holding `from` to the week holding `to`. */
export function weeksBetween(from: DateKey, to: DateKey): number {
  return daysBetween(mondayOf(from), mondayOf(to)) / 7;
}

/**
 * How many day columns the calendars render: the work week hides the weekend,
 * the full week shows it. Default view is `work` (stage de seconde créneaux are
 * weekdays only, so Sat/Sun are dead columns).
 */
export type WeekView = 'work' | 'full';
export const WEEK_VIEW_DAYS: Record<WeekView, number> = { work: 5, full: 7 };

/**
 * The days of the week starting at `weekStart`: `days` of them (5 for a work
 * week, 7 for a full week). Defaults to the full Monday-Sunday span.
 */
export function weekDaysFrom(weekStart: DateKey, days = 7): DateKey[] {
  const monday = parseDate(weekStart);
  return Array.from({ length: days }, (_, i) =>
    monday.add({ days: i }).toString(),
  );
}

/**
 * Land on the week of the slot closest to "now" so the viewer never opens onto a
 * blank gap week between two far-apart events (or after an all-past timeline).
 * Falls back to the week of `fallbackDay` (or today) when there are no slots.
 * Returns that week's Monday, every day read on the campus clock `timezone`.
 */
export function pickInitialWeek(
  nowMs: number,
  slots: { startTime: Date | string }[],
  fallbackDay: DateKey | null,
  timezone: string,
): DateKey {
  const today = toDateKey(new Date(nowMs), timezone);
  if (slots.length === 0) return mondayOf(fallbackDay ?? today);
  let nearest = toDateKey(slots[0].startTime, timezone);
  let nearestDist = Infinity;
  for (const s of slots) {
    const day = toDateKey(s.startTime, timezone);
    const dist = Math.abs(daysBetween(today, day));
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = day;
    }
  }
  return mondayOf(nearest);
}

/**
 * The view a calendar should open in: `full` when any slot falls on a weekend
 * of the campus, otherwise `work`. The work-week default densifies weekday-only
 * plannings, but it must never hide the very slot the calendar opens on, so a
 * week (or whole timeline) carrying a Saturday/Sunday activity opens full rather
 * than blank. Companion to {@link pickInitialWeek}: that picks which week to
 * open, this picks how wide. A persisted user choice still overrides this
 * initial seed.
 */
export function pickInitialWeekView(
  slots: { startTime: Date | string }[],
  timezone: string,
): WeekView {
  for (const s of slots) {
    if (weekdayOf(toDateKey(s.startTime, timezone)) >= 5) return 'full';
  }
  return 'work';
}

/**
 * A key formatted in French. The key is already a campus day, so it is pinned
 * to UTC midnight and formatted in UTC: no other timezone can shift it.
 */
function formatDay(day: DateKey, options: Intl.DateTimeFormatOptions): string {
  return parseDate(day)
    .toDate('UTC')
    .toLocaleDateString('fr-FR', { ...options, timeZone: 'UTC' });
}

/** A compact "1 - 7 déc 2026" style label for the visible week. */
export function weekLabel(weekDays: DateKey[]): string {
  const a = parseDate(weekDays[0]);
  const b = parseDate(weekDays[weekDays.length - 1]);
  const sameMonth = a.month === b.month;
  const sameYear = a.year === b.year;
  const left = formatDay(weekDays[0], {
    day: 'numeric',
    month: sameMonth && sameYear ? undefined : 'short',
    year: sameYear ? undefined : 'numeric',
  });
  const right = formatDay(weekDays[weekDays.length - 1], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${left} - ${right}`;
}
