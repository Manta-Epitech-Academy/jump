import { describe, expect, it } from 'vitest';
import { publicHolidays } from './publicHolidays';

const days = (departement: string, year: number) =>
  Object.fromEntries(
    (publicHolidays(departement, year) ?? []).map((h) => [h.day, h.name]),
  );

describe('publicHolidays', () => {
  it.each([
    [2026, '2026-04-06', '2026-05-14', '2026-05-25'],
    [2027, '2027-03-29', '2027-05-06', '2027-05-17'],
    [2028, '2028-04-17', '2028-05-25', '2028-06-05'],
    [2030, '2030-04-22', '2030-05-30', '2030-06-10'],
  ])(
    'should hang the movable holidays of %i off Easter',
    (year, easterMonday, ascension, whitMonday) => {
      // Arrange / Act
      const holidays = days('75', year);

      // Assert
      expect(holidays[easterMonday]).toBe('Lundi de Pâques');
      expect(holidays[ascension]).toBe('Ascension');
      expect(holidays[whitMonday]).toBe('Lundi de Pentecôte');
    },
  );

  it('should give a metropolitan département the eleven national days', () => {
    // Arrange / Act: the 2027 list published by calendrier.api.gouv.fr.
    const holidays = days('69', 2027);

    // Assert
    expect(Object.keys(holidays)).toEqual([
      '2027-01-01',
      '2027-03-29',
      '2027-05-01',
      '2027-05-06',
      '2027-05-08',
      '2027-05-17',
      '2027-07-14',
      '2027-08-15',
      '2027-11-01',
      '2027-11-11',
      '2027-12-25',
    ]);
  });

  it.each(['57', '67', '68'])(
    'should add Good Friday and 26 December in Alsace-Moselle (%s)',
    (departement) => {
      // Arrange / Act
      const holidays = days(departement, 2027);

      // Assert
      expect(holidays['2027-03-26']).toBe('Vendredi saint');
      expect(holidays['2027-12-26']).toBe('Saint-Étienne');
      expect(Object.keys(holidays)).toHaveLength(13);
    },
  );

  it('should keep Nancy, in the Meurthe-et-Moselle, on the national list', () => {
    // Arrange / Act: same académie as Metz, not the same law.
    const holidays = days('54', 2027);

    // Assert
    expect(holidays['2027-03-26']).toBeUndefined();
  });

  it.each([
    ['971', '2027-05-27'],
    ['972', '2027-05-22'],
    ['973', '2027-06-10'],
    ['974', '2027-12-20'],
    ['976', '2027-04-27'],
  ])(
    'should mark the abolition of slavery in %s on its own date',
    (departement, day) => {
      // Arrange / Act
      const holidays = days(departement, 2027);

      // Assert
      expect(holidays[day]).toBe("Abolition de l'esclavage");
    },
  );

  it('should know no holidays for a Pacific collectivity', () => {
    // Arrange / Act / Assert: its own calendar, not the metropolitan one.
    expect(publicHolidays('988', 2027)).toBeNull();
  });
});
