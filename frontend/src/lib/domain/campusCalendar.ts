import {
  CalendarDate,
  endOfMonth,
  getDayOfWeek,
  parseDate,
} from '@internationalized/date';
import { inkOn, type FillInk } from '../design/color';
import type { EventCategoryTag } from './eventCategory';
import type { EventLifecycleStatus } from './eventLifecycle';
import type { DateKey } from './planningTime';
import { MOIS_FR } from './schoolYear';
import { knowsSchoolHolidays, offDays, type OffDay } from './schoolHolidays';

// ─── Campus calendar ───────────────────────────────────────────────────────
//
// The dev space's landing page: every event of a campus over one school year,
// as twelve small months (the year view) and as a list, with the days without
// school greyed. Pure, so the whole layout of the year is decided and tested
// here and the components only paint it.
//
// Everything is a campus-local `DateKey`. The caller reads each event's days on
// the campus clock once; from there no instant, and so no browser or pod
// timezone, can move a band by a day.

/** An event as the calendar needs it, its days already read on the campus clock. */
export type CalendarEventInput = {
  id: string;
  name: string;
  first: DateKey;
  last: DateKey;
  /** The school year its start falls in (`schoolYearOf(...).label`). */
  schoolYear: string;
  category: EventCategoryTag | null;
  /** Read from `getEventStatus` on the server, never recomputed here. */
  status: EventLifecycleStatus;
  /** Enrolments shown in the dev space, never the count Jump holds. */
  shownEnrolments: number;
};

/** The colour an event is painted with, and the ink its day numbers take. */
export type CalendarFill = { color: string; ink: FillInk } | null;

export type CalendarEvent = CalendarEventInput & {
  fill: CalendarFill;
  /** "du 27 au 30 oct.", or "16 sept." for one day. */
  daysLabel: string;
  /** "du 27 au 30 octobre 2026 · 4 jours", or "mercredi 16 septembre 2026 · 1 jour". */
  daysLabelLong: string;
  /** Calendar days from today to the first day, for an upcoming event. */
  daysUntilStart: number | null;
};

export type CalendarCell = {
  day: DateKey;
  dayOfMonth: number;
  weekend: boolean;
  today: boolean;
  /** The event painted on the day: the longest when several share it. */
  painted: { id: string; startsRun: boolean; endsRun: boolean } | null;
  /** Every event on the day, longest first, for the tooltip. */
  eventIds: string[];
  /** Shown only on a day no event is painted on, as in the mockup. */
  off: (OffDay & { startsRun: boolean; endsRun: boolean }) | null;
};

export type CalendarMonth = {
  /** `YYYY-MM`. */
  key: string;
  /** "août". */
  name: string;
  year: number;
  /** Empty slots before the 1st, Monday first. */
  leadingBlanks: number;
  cells: CalendarCell[];
  isCurrent: boolean;
  /** Events of the school year starting this month. */
  eventCount: number;
};

export type CalendarListGroup = {
  key: string;
  name: string;
  year: number;
  /** The day the event starts, as the row's date column reads it: 16, "mer.". */
  events: { id: string; dayOfMonth: number; weekday: string }[];
};

/** What the off-day shading can say for this year. */
export type OffDaysCoverage =
  /** No département: no off days at all. */
  | 'none'
  /** Public holidays and school holidays. */
  | 'known'
  /** Public holidays only: the ministry has not published this year yet. */
  | 'publicOnly';

export type CampusCalendar = {
  schoolYear: string;
  months: CalendarMonth[];
  list: CalendarListGroup[];
  events: Record<string, CalendarEvent>;
  legend: {
    categories: EventCategoryTag[];
    uncategorized: boolean;
    offDays: OffDaysCoverage;
  };
  /** No event of the school year: the page says so instead of a bare grid. */
  empty: boolean;
};

const MOIS_COURTS = [
  '',
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

const JOURS = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
] as const;

const JOURS_COURTS = [
  'lun.',
  'mar.',
  'mer.',
  'jeu.',
  'ven.',
  'sam.',
  'dim.',
] as const;

/** Monday 0 ... Sunday 6, whatever the runtime's locale. */
const weekdayOf = (date: CalendarDate) => getDayOfWeek(date, 'fr-FR');

const daysBetween = (from: DateKey, to: DateKey) =>
  parseDate(to).compare(parseDate(from));

function daysLabel(first: DateKey, last: DateKey): string {
  const a = parseDate(first);
  const b = parseDate(last);
  if (first === last) return `${a.day} ${MOIS_COURTS[a.month]}`;
  return a.month === b.month && a.year === b.year
    ? `du ${a.day} au ${b.day} ${MOIS_COURTS[b.month]}`
    : `du ${a.day} ${MOIS_COURTS[a.month]} au ${b.day} ${MOIS_COURTS[b.month]}`;
}

function daysLabelLong(first: DateKey, last: DateKey): string {
  const a = parseDate(first);
  const b = parseDate(last);
  const count = daysBetween(first, last) + 1;
  const length = `${count} ${count > 1 ? 'jours' : 'jour'}`;
  if (first === last) {
    return `${JOURS[weekdayOf(a)]} ${a.day} ${MOIS_FR[a.month]} ${a.year} · ${length}`;
  }
  const from =
    a.year !== b.year
      ? `${a.day} ${MOIS_FR[a.month]} ${a.year}`
      : a.month !== b.month
        ? `${a.day} ${MOIS_FR[a.month]}`
        : `${a.day}`;
  return `du ${from} au ${b.day} ${MOIS_FR[b.month]} ${b.year} · ${length}`;
}

/** Longest first; on a tie, the earlier start, then the name. */
function byPaintPriority(a: CalendarEventInput, b: CalendarEventInput) {
  return (
    daysBetween(b.first, b.last) - daysBetween(a.first, a.last) ||
    a.first.localeCompare(b.first) ||
    a.name.localeCompare(b.name, 'fr')
  );
}

/** The first day of the school year's grid: 1 August of its first year. */
function gridStart(schoolYear: string): CalendarDate {
  return new CalendarDate(Number(schoolYear.slice(0, 4)), 8, 1);
}

/**
 * Lay out a campus's school year.
 *
 * The grid runs August to July, the months of Jump's school year (which turns
 * on 31 July), and paints every event day that falls in it, an event of the
 * neighbouring year included. The list and the month counts hold only the
 * events of `schoolYear`, so an event is listed once, in the year its start
 * falls in.
 */
export function buildCampusCalendar(input: {
  schoolYear: string;
  today: DateKey;
  departement: string | null;
  events: readonly CalendarEventInput[];
}): CampusCalendar {
  const { schoolYear, today, departement } = input;
  const start = gridStart(schoolYear);
  const end = start.add({ years: 1 }).subtract({ days: 1 });

  const events: Record<string, CalendarEvent> = {};
  for (const e of input.events) {
    events[e.id] = {
      ...e,
      fill: e.category
        ? { color: e.category.color, ink: inkOn(e.category.color) }
        : null,
      daysLabel: daysLabel(e.first, e.last),
      daysLabelLong: daysLabelLong(e.first, e.last),
      daysUntilStart:
        e.status === 'upcoming' ? daysBetween(today, e.first) : null,
    };
  }
  const ofYear = input.events
    .filter((e) => e.schoolYear === schoolYear)
    .sort(
      (a, b) =>
        a.first.localeCompare(b.first) || a.name.localeCompare(b.name, 'fr'),
    );
  const painting = [...input.events].sort(byPaintPriority);
  const off = departement
    ? offDays(departement, start.toString(), end.toString())
    : new Map<DateKey, OffDay>();

  const months: CalendarMonth[] = [];
  for (let m = 0; m < 12; m++) {
    const first = start.add({ months: m });
    const key = first.toString().slice(0, 7);
    const length = endOfMonth(first).day;
    const cells: CalendarCell[] = [];
    for (let d = 1; d <= length; d++) {
      const date = first.set({ day: d });
      const day = date.toString();
      const weekday = weekdayOf(date);
      const onDay = painting.filter((e) => e.first <= day && day <= e.last);
      cells.push({
        day,
        dayOfMonth: d,
        weekend: weekday >= 5,
        today: day === today,
        painted: onDay[0]
          ? { id: onDay[0].id, startsRun: false, endsRun: false }
          : null,
        eventIds: onDay.map((e) => e.id),
        off: null,
      });
    }
    // A band breaks where its run does, and at each week's and month's edge:
    // the grid wraps on Sunday, so a band never crosses a line.
    cells.forEach((cell, i) => {
      const prev = cells[i - 1];
      const next = cells[i + 1];
      const opensRow = i === 0 || weekdayOf(parseDate(cell.day)) === 0;
      const closesRow =
        i === cells.length - 1 || weekdayOf(parseDate(cell.day)) === 6;
      if (cell.painted) {
        cell.painted.startsRun =
          opensRow || prev?.painted?.id !== cell.painted.id;
        cell.painted.endsRun =
          closesRow || next?.painted?.id !== cell.painted.id;
        return;
      }
      const offDay = off.get(cell.day);
      if (!offDay) return;
      const offRun = (c: CalendarCell | undefined) =>
        !!c && !c.painted && off.has(c.day);
      cell.off = {
        ...offDay,
        startsRun: opensRow || !offRun(prev),
        endsRun: closesRow || !offRun(next),
      };
    });
    months.push({
      key,
      name: MOIS_FR[first.month],
      year: first.year,
      leadingBlanks: weekdayOf(first),
      cells,
      isCurrent: today.slice(0, 7) === key,
      eventCount: ofYear.filter((e) => e.first.slice(0, 7) === key).length,
    });
  }

  const list: CalendarListGroup[] = [];
  for (const e of ofYear) {
    const date = parseDate(e.first);
    const key = e.first.slice(0, 7);
    let group = list.at(-1);
    if (group?.key !== key) {
      group = { key, name: MOIS_FR[date.month], year: date.year, events: [] };
      list.push(group);
    }
    group.events.push({
      id: e.id,
      dayOfMonth: date.day,
      weekday: JOURS_COURTS[weekdayOf(date)],
    });
  }

  const categories = new Map<string, EventCategoryTag>();
  for (const e of input.events) {
    if (e.category) categories.set(e.category.key, e.category);
  }

  return {
    schoolYear,
    months,
    list,
    events,
    legend: {
      categories: [...categories.values()].sort((a, b) =>
        a.label.localeCompare(b.label, 'fr'),
      ),
      uncategorized: input.events.some((e) => !e.category),
      offDays: !departement
        ? 'none'
        : knowsSchoolHolidays(departement, schoolYear)
          ? 'known'
          : 'publicOnly',
    },
    empty: ofYear.length === 0,
  };
}
