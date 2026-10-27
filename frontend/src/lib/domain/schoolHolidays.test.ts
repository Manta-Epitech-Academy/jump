import { describe, expect, it } from 'vitest';
import { academieOf, DEPARTEMENTS } from './school';
import { knowsSchoolHolidays, offDays } from './schoolHolidays';
import { SCHOOL_HOLIDAYS } from './schoolHolidays.data';

describe('school holidays data', () => {
  it('should cover 2026-2027 for every académie of a département', () => {
    // Arrange: the Pacific collectivities run a calendar of their own, which
    // the ministry publishes on another rhythm.
    const academies = new Set(
      DEPARTEMENTS.filter((d) => !['986', '987', '988'].includes(d)).map(
        academieOf,
      ),
    );

    // Act
    const missing = [...academies].filter(
      (a) => !SCHOOL_HOLIDAYS[a!]?.some(([year]) => year === '2026-2027'),
    );

    // Assert
    expect(missing).toEqual([]);
  });

  it('should hold every period as a first day no later than its last', () => {
    // Arrange / Act
    const inverted = Object.values(SCHOOL_HOLIDAYS)
      .flat()
      .filter(([, , first, last]) => last < first);

    // Assert
    expect(inverted).toEqual([]);
  });
});

describe('offDays', () => {
  it('should read the Toussaint from its first day off to the eve of school', () => {
    // Arrange / Act: zone A, 2026. Classes stop Friday 16 October and resume
    // Monday 2 November.
    const days = offDays('69', '2026-10-15', '2026-11-03');

    // Assert
    expect(days.has('2026-10-16')).toBe(false);
    expect(days.get('2026-10-17')).toEqual({
      kind: 'vacances',
      name: 'Vacances de la Toussaint',
    });
    expect(days.has('2026-11-02')).toBe(false);
  });

  it('should name a public holiday over the school holiday it falls in', () => {
    // Arrange / Act: 1 November 2026 is both.
    const days = offDays('69', '2026-11-01', '2026-11-01');

    // Assert
    expect(days.get('2026-11-01')).toEqual({
      kind: 'ferie',
      name: 'Toussaint',
    });
  });

  it('should follow the zone of the académie', () => {
    // Arrange / Act: winter 2027 is 13-28 February in zone A, 20 February to
    // 7 March in zone B (Strasbourg).
    const lyon = offDays('69', '2027-03-01', '2027-03-01');
    const strasbourg = offDays('67', '2027-03-01', '2027-03-01');

    // Assert
    expect(lyon.has('2027-03-01')).toBe(false);
    expect(strasbourg.get('2027-03-01')?.name).toBe("Vacances d'Hiver");
  });

  it('should give La Réunion its own calendar and its own 20 December', () => {
    // Arrange / Act
    const days = offDays('974', '2026-10-10', '2026-12-20');

    // Assert
    expect(days.get('2026-10-10')?.name).toBe('Vacances après 1ère période');
    expect(days.get('2026-12-20')).toEqual({
      kind: 'ferie',
      name: "Abolition de l'esclavage",
    });
  });

  it('should clip a period to the window asked for', () => {
    // Arrange / Act
    const days = offDays('69', '2026-12-31', '2027-01-02');

    // Assert
    expect([...days.keys()].sort()).toEqual([
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });
});

describe('knowsSchoolHolidays', () => {
  it('should know a published year and not an unpublished one', () => {
    // Arrange / Act / Assert
    expect(knowsSchoolHolidays('974', '2026-2027')).toBe(true);
    expect(knowsSchoolHolidays('974', '2027-2028')).toBe(false);
  });
});
