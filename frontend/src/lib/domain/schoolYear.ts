import { toDateKey } from './planningTime';

/**
 * A French school year runs September → August. Epitech reasons by school year
 * (its native granularity), so the dev workspace groups events by it. Derived
 * from `Event.date` in the campus timezone, never stored, so it can't drift
 * from the date.
 */
export type SchoolYear = {
  /** The September year the cycle opens on (a June 2026 event → 2025). */
  startYear: number;
  /** Display label, e.g. "2025-2026". */
  label: string;
};

export function schoolYearOf(
  date: Date | string,
  timezone: string,
): SchoolYear {
  const key = toDateKey(date, timezone); // "YYYY-MM-DD" in campus tz
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const startYear = month >= 9 ? year : year - 1;
  return { startYear, label: `${startYear}-${startYear + 1}` };
}
