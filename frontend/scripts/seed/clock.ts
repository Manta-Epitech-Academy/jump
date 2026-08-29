/**
 * Time.
 *
 * Every date this generator writes is derived from one anchor, passed with
 * `--today`. `new Date()` is banned in this directory, and the ban is the whole
 * point rather than a style preference.
 *
 * The seed it replaces anchored on the run date. That looks harmless and is the
 * failure nobody sees: a scenario written as "an event that has not happened
 * yet" silently becomes "an event that finished three months ago", so the PO
 * opens the environment expecting one thing and tests another, and the manifest
 * that told them what to look for is now wrong. Pinning the anchor makes the
 * dataset say the same thing in December as in June.
 */

import { schoolYearOf } from '../../src/lib/domain/schoolYear';

const DAY_MS = 24 * 60 * 60 * 1000;
const ANCHOR_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export type Clock = {
  /** The anchor itself, at midnight UTC. */
  readonly today: Date;
  /** `days(-3)` is three days before the anchor, at midnight. */
  days(offset: number): Date;
  /** The anchor shifted by `offset` days, at `hour:minute` UTC. */
  at(offset: number, hour: number, minute?: number): Date;
  /** Like `days`, but skipping Saturdays and Sundays. */
  weekdays(offset: number): Date;
  /** The school-year label the anchor falls in, e.g. `2026-2027`. */
  readonly schoolYear: string;
  /** The label `n` school years before the anchor. */
  schoolYearBefore(n: number): string;
  /** `YYYY-MM-DD` for a date, for ids and file keys. */
  dateKey(date: Date): string;
};

export function parseAnchor(raw: string | undefined): Date {
  if (!raw) {
    throw new Error(
      '--today is required: the generator never reads the wall clock.',
    );
  }
  if (!ANCHOR_REGEX.test(raw)) {
    throw new Error(`--today must be YYYY-MM-DD, got "${raw}".`);
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`--today is not a real date: "${raw}".`);
  }
  return parsed;
}

export function createClock(anchor: Date): Clock {
  const days = (offset: number): Date =>
    new Date(anchor.getTime() + offset * DAY_MS);

  const at = (offset: number, hour: number, minute = 0): Date => {
    const base = days(offset);
    base.setUTCHours(hour, minute, 0, 0);
    return base;
  };

  const weekdays = (offset: number): Date => {
    const step = offset >= 0 ? 1 : -1;
    let remaining = Math.abs(offset);
    let cursor = 0;
    while (remaining > 0) {
      cursor += step;
      const day = days(cursor).getUTCDay();
      if (day !== 0 && day !== 6) remaining -= 1;
    }
    return days(cursor);
  };

  // Paris, matching `currentSchoolYearLabel`: the cycle belongs to the platform,
  // not to a campus, and the July cutover must not land a day apart per campus.
  const schoolYear = schoolYearOf(anchor, 'Europe/Paris').label;

  return {
    today: anchor,
    days,
    at,
    weekdays,
    schoolYear,
    schoolYearBefore: (n) => {
      const [start] = schoolYear.split('-').map(Number);
      const from = (start ?? 0) - n;
      return `${from}-${from + 1}`;
    },
    dateKey: (date) => date.toISOString().slice(0, 10),
  };
}
