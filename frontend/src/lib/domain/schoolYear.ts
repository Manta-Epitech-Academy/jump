import { toDateKey } from './planningTime';

/**
 * Epitech's school year runs mid-August to mid-August: the cycle opens on
 * 15 August and the next one starts the following 15 August. So 14 Aug 2026
 * still belongs to 2025-2026, while 15 Aug 2026 opens 2026-2027. Epitech
 * reasons by school year (its native granularity), so the dev workspace and the
 * admin events page group by it. Derived from `Event.date` in the campus
 * timezone, never stored, so it can't drift from the date.
 */
export const SCHOOL_YEAR_START_MONTH = 8; // August
export const SCHOOL_YEAR_START_DAY = 15;

export type SchoolYear = {
  /** The August year the cycle opens on (a June 2026 event → 2025). */
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
  const day = Number(key.slice(8, 10));
  // On or after 15 August → this year opens the cycle; before → the previous one.
  const afterCutoff =
    month > SCHOOL_YEAR_START_MONTH ||
    (month === SCHOOL_YEAR_START_MONTH && day >= SCHOOL_YEAR_START_DAY);
  const startYear = afterCutoff ? year : year - 1;
  return { startYear, label: `${startYear}-${startYear + 1}` };
}

/** French month names indexed 1-12 (index 0 unused), for switcher labels. */
export const MOIS_FR = [
  '',
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;
