import { parseDate } from '@internationalized/date';
import type { DateKey } from './planningTime';
import { publicHolidays } from './publicHolidays';
import { academieOf } from './school';
import { SCHOOL_HOLIDAYS } from './schoolHolidays.data';

// ─── Days without school ───────────────────────────────────────────────────
//
// What the campus calendar greys out: the school holidays of the campus's
// académie and the public holidays of its département. Both follow
// `Campus.departement` and nothing else, so a campus without one has no off
// days at all, never another zone's.
//
// The school holidays are the ministry's own dates, copied into
// `schoolHolidays.data.ts` by `scripts/fetch-school-holidays.ts`. The file ends
// somewhere, so a school year it does not hold is reported as unknown
// (`knowsSchoolHolidays`) instead of passing for a year without holidays.

/** One period, as the generated file writes it. */
export type SchoolHolidayPeriod = readonly [
  schoolYear: string,
  name: string,
  first: DateKey,
  last: DateKey,
];

/** Why a day has no school: a school holiday or a public holiday. */
export type OffDay = { kind: 'vacances' | 'ferie'; name: string };

function periodsOf(departement: string): readonly SchoolHolidayPeriod[] {
  const academie = academieOf(departement);
  return academie ? (SCHOOL_HOLIDAYS[academie] ?? []) : [];
}

/** Whether the file holds `schoolYear`'s holidays for this département. */
export function knowsSchoolHolidays(
  departement: string,
  schoolYear: string,
): boolean {
  return periodsOf(departement).some(([year]) => year === schoolYear);
}

/**
 * Every day without school from `from` to `to` (inclusive) in `departement`,
 * keyed by day. A public holiday wins over the school holiday it falls in, as
 * the more specific of the two names.
 */
export function offDays(
  departement: string,
  from: DateKey,
  to: DateKey,
): Map<DateKey, OffDay> {
  const days = new Map<DateKey, OffDay>();

  for (const [, name, first, last] of periodsOf(departement)) {
    if (last < from || first > to) continue;
    let day = parseDate(first < from ? from : first);
    const end = last > to ? to : last;
    while (day.toString() <= end) {
      days.set(day.toString(), { kind: 'vacances', name });
      day = day.add({ days: 1 });
    }
  }

  for (
    let year = Number(from.slice(0, 4));
    year <= Number(to.slice(0, 4));
    year++
  ) {
    for (const { day, name } of publicHolidays(departement, year) ?? []) {
      if (day >= from && day <= to) days.set(day, { kind: 'ferie', name });
    }
  }

  return days;
}
