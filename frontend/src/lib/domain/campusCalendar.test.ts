import { describe, expect, it } from 'vitest';
import {
  buildCampusCalendar,
  type CalendarEventInput,
  type CampusCalendar,
} from './campusCalendar';

const CAMP = {
  key: 'camp',
  label: 'Camp',
  color: '#ff5f3a',
};

function event(
  over: Partial<CalendarEventInput> & Pick<CalendarEventInput, 'id'>,
): CalendarEventInput {
  return {
    name: over.id,
    campaign: null,
    first: '2026-10-27',
    last: '2026-10-27',
    schoolYear: '2026-2027',
    category: CAMP,
    status: 'upcoming',
    shownEnrolments: 12,
    ...over,
  };
}

function build(
  events: CalendarEventInput[],
  over: { departement?: string | null; schoolYear?: string } = {},
): CampusCalendar {
  return buildCampusCalendar({
    schoolYear: over.schoolYear ?? '2026-2027',
    today: '2026-10-26',
    departement: over.departement === undefined ? '69' : over.departement,
    events,
  });
}

const cell = (calendar: CampusCalendar, day: string) =>
  calendar.months
    .find((m) => m.key === day.slice(0, 7))!
    .cells.find((c) => c.day === day)!;

describe('buildCampusCalendar grid', () => {
  it('should lay the school year out from August to July, Monday first', () => {
    // Arrange / Act
    const calendar = build([]);

    // Assert: 1 August 2026 is a Saturday.
    expect(calendar.months.map((m) => m.key)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
      '2027-06',
      '2027-07',
    ]);
    expect(calendar.months[0].leadingBlanks).toBe(5);
    expect(calendar.months[0].cells).toHaveLength(31);
  });

  it('should break a band at the end of a week and of a month', () => {
    // Arrange: Friday 30 October to Tuesday 3 November 2026.
    const calendar = build([
      event({ id: 'hal', first: '2026-10-30', last: '2026-11-03' }),
    ]);

    // Act
    const runs = [
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ].map((day) => {
      const { startsRun, endsRun } = cell(calendar, day).painted!;
      return [startsRun, endsRun];
    });

    // Assert
    expect(runs).toEqual([
      [true, false],
      [false, true],
      [true, true],
      [true, false],
      [false, true],
    ]);
  });

  it('should paint the longest event and name both on a shared day', () => {
    // Arrange
    const calendar = build([
      event({ id: 'club', first: '2026-10-28', last: '2026-10-28' }),
      event({ id: 'camp', first: '2026-10-27', last: '2026-10-30' }),
    ]);

    // Act
    const shared = cell(calendar, '2026-10-28');

    // Assert
    expect(shared.painted?.id).toBe('camp');
    expect(shared.eventIds).toEqual(['camp', 'club']);
    expect(shared.painted).toMatchObject({ startsRun: false, endsRun: false });
  });

  it('should grey the days without school, under an event only where none is painted', () => {
    // Arrange: Toussaint 2026 in zone A runs 17 October to 1 November.
    const calendar = build([
      event({ id: 'hal', first: '2026-10-28', last: '2026-10-30' }),
    ]);

    // Act
    const before = cell(calendar, '2026-10-27');
    const during = cell(calendar, '2026-10-28');
    const holiday = cell(calendar, '2026-11-01');

    // Assert
    expect(before.off).toMatchObject({
      kind: 'vacances',
      startsRun: false,
      endsRun: true,
    });
    expect(during.off).toBeNull();
    expect(holiday.off).toMatchObject({ kind: 'ferie', name: 'Toussaint' });
    expect(calendar.legend.offDays).toBe('known');
  });

  it('should grey nothing for a campus without a département', () => {
    // Arrange / Act
    const calendar = build([], { departement: null });

    // Assert
    expect(calendar.months.flatMap((m) => m.cells).some((c) => c.off)).toBe(
      false,
    );
    expect(calendar.legend.offDays).toBe('none');
  });

  it('should keep the public holidays of a year whose school holidays are not published', () => {
    // Arrange / Act: La Réunion's 2027-2028 calendar is not out yet.
    const calendar = build([], { departement: '974', schoolYear: '2027-2028' });

    // Assert
    expect(calendar.legend.offDays).toBe('publicOnly');
    expect(cell(calendar, '2027-12-20').off?.kind).toBe('ferie');
  });

  it('should mark today and the current month', () => {
    // Arrange / Act
    const calendar = build([]);

    // Assert
    expect(cell(calendar, '2026-10-26').today).toBe(true);
    expect(
      calendar.months.filter((m) => m.isCurrent).map((m) => m.key),
    ).toEqual(['2026-10']);
  });
});

describe('buildCampusCalendar list and counts', () => {
  it('should list only the school year events, by date, grouped by month', () => {
    // Arrange: the summer camp of the year before still runs into August.
    const calendar = build([
      event({ id: 'dec', first: '2026-12-12', last: '2026-12-12' }),
      event({
        id: 'summer',
        first: '2026-07-27',
        last: '2026-08-02',
        schoolYear: '2025-2026',
      }),
      event({ id: 'sep', first: '2026-09-16', last: '2026-09-16' }),
      event({ id: 'sep2', first: '2026-09-02', last: '2026-09-02' }),
    ]);

    // Act
    const groups = calendar.list.map((g) => [g.key, g.events.map((e) => e.id)]);

    // Assert
    expect(groups).toEqual([
      ['2026-09', ['sep2', 'sep']],
      ['2026-12', ['dec']],
    ]);
    expect(cell(calendar, '2026-08-01').painted?.id).toBe('summer');
    expect(calendar.months[0].eventCount).toBe(0);
    expect(calendar.months[1].eventCount).toBe(2);
  });

  it('should say a school year without events is empty', () => {
    // Arrange / Act
    const calendar = build([
      event({
        id: 'old',
        first: '2026-07-27',
        last: '2026-08-02',
        schoolYear: '2025-2026',
      }),
    ]);

    // Assert
    expect(calendar.empty).toBe(true);
  });
});

describe('buildCampusCalendar events', () => {
  it('should count the days to an upcoming start on the campus calendar', () => {
    // Arrange / Act
    const calendar = build([
      event({ id: 'soon', first: '2026-10-28', last: '2026-10-28' }),
      event({ id: 'now', first: '2026-10-26', status: 'ongoing' }),
    ]);

    // Assert
    expect(calendar.events.soon.daysUntilStart).toBe(2);
    expect(calendar.events.now.daysUntilStart).toBeNull();
  });

  it.each([
    [
      '2026-09-16',
      '2026-09-16',
      '16 sept.',
      'mercredi 16 septembre 2026 · 1 jour',
    ],
    [
      '2026-10-27',
      '2026-10-30',
      'du 27 au 30 oct.',
      'du 27 au 30 octobre 2026 · 4 jours',
    ],
    [
      '2027-02-26',
      '2027-03-02',
      'du 26 févr. au 2 mars',
      'du 26 février au 2 mars 2027 · 5 jours',
    ],
    [
      '2026-12-30',
      '2027-01-02',
      'du 30 déc. au 2 janv.',
      'du 30 décembre 2026 au 2 janvier 2027 · 4 jours',
    ],
  ])('should name the days %s to %s', (first, last, short, long) => {
    // Arrange / Act
    const calendar = build([event({ id: 'e', first, last })]);

    // Assert
    expect(calendar.events.e.daysLabel).toBe(short);
    expect(calendar.events.e.daysLabelLong).toBe(long);
  });

  it('should paint a category with its colour and an uncategorised event with none', () => {
    // Arrange / Act
    const calendar = build([
      event({ id: 'camp' }),
      event({ id: 'bare', category: null }),
      event({
        id: 'club',
        category: {
          key: 'club',
          label: 'Coding Club',
          color: '#013afb',
        },
      }),
    ]);

    // Assert
    expect(calendar.events.camp.fill).toEqual({
      color: '#ff5f3a',
      ink: 'dark',
    });
    expect(calendar.events.club.fill).toEqual({
      color: '#013afb',
      ink: 'light',
    });
    expect(calendar.events.bare.fill).toBeNull();
    expect(calendar.legend.categories.map((c) => c.label)).toEqual([
      'Camp',
      'Coding Club',
    ]);
    expect(calendar.legend.uncategorized).toBe(true);
  });
});
