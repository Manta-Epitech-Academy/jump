/**
 * The weekly admin digest's calendar: which week a moment belongs to, and when
 * its month began.
 *
 * Europe/Paris, because the digest is the platform's own cycle and not a
 * campus's, as `currentSchoolYearLabel` already decides for the onboarding
 * dossier. Here rather than beside the send so the seed, which cannot reach
 * server code, writes the same week keys the application does.
 */

import {
  fromDate,
  startOfMonth,
  startOfWeek,
  toCalendarDate,
} from '@internationalized/date';

const DIGEST_TIMEZONE = 'Europe/Paris';

/**
 * The Monday of `at`'s Paris week, as the UTC-midnight `Date` a `@db.Date`
 * column stores (`AdminDigest_Run.weekOf`). The first day of the week is passed
 * explicitly rather than read from the locale, so the key cannot move with an
 * ICU update.
 */
export function digestWeekOf(at: Date): Date {
  const monday = startOfWeek(
    toCalendarDate(fromDate(at, DIGEST_TIMEZONE)),
    'fr-FR',
    'mon',
  );
  return new Date(Date.UTC(monday.year, monday.month - 1, monday.day));
}

/** The instant the Paris month containing `at` began. */
export function digestMonthStart(at: Date): Date {
  return startOfMonth(toCalendarDate(fromDate(at, DIGEST_TIMEZONE))).toDate(
    DIGEST_TIMEZONE,
  );
}
