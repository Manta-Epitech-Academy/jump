import { toDateKey } from './planningTime';

/**
 * Epitech's school year runs end of July to end of July: the cycle opens on
 * 31 July and the next one starts the following 31 July. So 30 Jul 2026
 * still belongs to 2025-2026, while 31 Jul 2026 opens 2026-2027. Epitech
 * reasons by school year (its native granularity), so the dev workspace and the
 * admin events page group by it. Derived from `Event.date` in the campus
 * timezone, never stored, so it can't drift from the date.
 */
const SCHOOL_YEAR_START_MONTH = 7; // July (1-based)
const SCHOOL_YEAR_START_DAY = 31;

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

/**
 * The school year in progress right now, as a label.
 *
 * Paris, because this is the platform's own cycle rather than a campus's: the
 * onboarding dossier is Jump-wide, and `schoolingService` already defaults to the
 * same zone. A year derived from an *event* still goes through `schoolYearOf`
 * with that event's campus timezone.
 */
export function currentSchoolYearLabel(timezone = 'Europe/Paris'): string {
  return schoolYearOf(new Date(), timezone).label;
}

/**
 * The half-open date range a school-year label covers, `[from, to)`.
 *
 * Derived from the same two constants as {@link schoolYearOf}, so the two cannot
 * disagree about where a year starts. `to` is the next cycle's opening instant,
 * exclusive, which is what makes a `< to` comparison correct without any
 * end-of-day arithmetic.
 *
 * Exists for figures that live on a TIME SERIES rather than on an event: usage
 * rows carry a campus and sometimes an event, never a school year, so the year
 * filter has to be a range over `occurredAt`. Deriving it from the events in
 * scope instead would work only for the event-scoped features and would silently
 * drop every campus-scoped one.
 *
 * UTC, because these bounds only ever go into a database comparison. A
 * campus-local boundary would put the same row in two different years depending
 * on who read it.
 */
export function schoolYearBounds(label: string): { from: Date; to: Date } {
  const startYear = Number(label.slice(0, 4));
  if (!/^\d{4}-\d{4}$/.test(label) || Number.isNaN(startYear)) {
    throw new Error(`Not a school-year label: ${label}`);
  }
  const month = SCHOOL_YEAR_START_MONTH - 1; // Date months are 0-based
  return {
    from: new Date(Date.UTC(startYear, month, SCHOOL_YEAR_START_DAY)),
    to: new Date(Date.UTC(startYear + 1, month, SCHOOL_YEAR_START_DAY)),
  };
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
