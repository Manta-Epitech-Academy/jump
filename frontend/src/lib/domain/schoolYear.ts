import { toDateKey } from './planningTime';

/**
 * Epitech's school year runs end of July to end of July: the cycle opens on
 * 31 July and the next one starts the following 31 July. So 30 Jul 2026
 * still belongs to 2025-2026, while 31 Jul 2026 opens 2026-2027. Epitech
 * reasons by school year (its native granularity), so the dev workspace and the
 * admin events page group by it. Derived from `Event.date` in the campus
 * timezone, never stored, so it can't drift from the date.
 */
export const SCHOOL_YEAR_START_MONTH = 7; // July (1-based)
export const SCHOOL_YEAR_START_DAY = 31;

export type SchoolYear = {
  /** The July year the cycle opens on (a June 2026 event → 2025). */
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
  // On or after 31 July → this year opens the cycle; before → the previous one.
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
