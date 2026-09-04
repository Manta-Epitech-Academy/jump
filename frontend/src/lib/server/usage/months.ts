/**
 * Calendar-month arithmetic for the usage figures.
 *
 * `Usage_FeatureMonthly` is grained by month, and the talent pseudonym rotates
 * every month, so the month is not a formatting detail here: it is the unit both
 * the cube and the distinct-actor count are defined in. Reading a window
 * therefore means naming the months it covers, and that arithmetic lives here
 * rather than inline so the reader, the rollup and the tests cannot each spell
 * it differently.
 *
 * UTC throughout, matching {@link usageMonth}, which owns the format. A
 * campus-local month would file one use under two different months depending on
 * who read it, and the rollup's unique constraint would then hold two rows for
 * one fact.
 */

import { usageMonth } from './actorHash';

/** `[from, to)` for a `"YYYY-MM"` label, in UTC. */
export function monthBounds(month: string): { from: Date; to: Date } {
  const [year, index] = month.split('-').map(Number);
  return {
    from: new Date(Date.UTC(year, index - 1, 1)),
    to: new Date(Date.UTC(year, index, 1)),
  };
}

/**
 * Every month a half-open `[from, to)` period touches, oldest first.
 *
 * Rounds OUTWARD: a period starting on the 20th includes that whole month. The
 * direction is deliberate and it is the one that matters. Rounding inward would
 * drop up to 27 days of the most recent data, and the error that costs something
 * here is declaring a live feature unused, never counting a few days twice.
 */
export function monthsCovering(from: Date, to: Date): string[] {
  if (!(from < to)) return [];
  const months: string[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
  );
  // The last instant inside the period, not `to` itself: `to` is exclusive, so a
  // period ending exactly on a month boundary must not pull in the month that
  // boundary opens.
  const last = usageMonth(new Date(to.getTime() - 1));
  for (;;) {
    const label = usageMonth(cursor);
    months.push(label);
    if (label === last) return months;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
}

/** The label `n` months away from `month` (negative to go back). */
export function shiftMonth(month: string, n: number): string {
  const { from } = monthBounds(month);
  from.setUTCMonth(from.getUTCMonth() + n);
  return usageMonth(from);
}

/**
 * The months of a window that are COMPLETE, i.e. already over at `now`.
 *
 * The year-on-year comparison uses these and only these. The month in progress
 * is folded into the cube only as far as the last rollup run, and the cron is
 * weekly, so comparing a partial month against a complete one a year earlier
 * would report a decline that is an artefact of the calendar and the schedule.
 */
export function completeMonths(months: string[], now: Date): string[] {
  const current = usageMonth(now);
  return months.filter((m) => m < current);
}
