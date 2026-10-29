import { describe, it, expect } from 'vitest';
import { greetingFor } from './devVoice';
import { campusClock } from './planningTime';
import { firstNameOf } from './profile';

const MONDAY = 1;
const WEDNESDAY = 3;
const FRIDAY = 5;

const greet = (
  hour: number,
  weekday = WEDNESDAY,
  { firstName = 'Julien' as string | null, startsToday = false } = {},
) => greetingFor({ hour, weekday, firstName, startsToday });

describe('greetingFor', () => {
  it('says good morning, then good evening from 18:00', () => {
    expect(greet(5)).toBe('Bonjour, Julien');
    expect(greet(17)).toBe('Bonjour, Julien');
    expect(greet(18)).toBe('Bonsoir, Julien');
    expect(greet(20)).toBe('Bonsoir, Julien');
  });

  it('asks who is still there from 21:00 to 04:59, over every other line', () => {
    expect(greet(21)).toBe('Encore là, Julien ?');
    expect(greet(4)).toBe('Encore là, Julien ?');
    expect(greet(23, MONDAY, { startsToday: true })).toBe(
      'Encore là, Julien ?',
    );
  });

  it('says jour J when an event starts today, over the day of the week', () => {
    expect(greet(9, MONDAY, { startsToday: true })).toBe(
      "C'est le jour J, Julien",
    );
  });

  it('wishes a good week on Monday morning only', () => {
    expect(greet(11, MONDAY)).toBe('Bonne semaine, Julien');
    expect(greet(12, MONDAY)).toBe('Bonjour, Julien');
  });

  it('sees the weekend coming from Friday 14:00', () => {
    expect(greet(13, FRIDAY)).toBe('Bonjour, Julien');
    expect(greet(14, FRIDAY)).toBe('Bientôt le week-end, Julien');
    expect(greet(19, FRIDAY)).toBe('Bientôt le week-end, Julien');
  });

  it('greets without a name when the account has none', () => {
    expect(greet(9, WEDNESDAY, { firstName: null })).toBe('Bonjour');
    expect(greet(22, WEDNESDAY, { firstName: null })).toBe('Encore là ?');
  });
});

describe('campusClock', () => {
  it("reads the campus's hour, not the server's, across daylight saving", () => {
    // 07:30 UTC is 08:30 in Paris in winter and 09:30 in summer.
    expect(campusClock('2026-01-12T07:30:00Z', 'Europe/Paris')).toEqual({
      hour: 8,
      weekday: MONDAY,
    });
    expect(campusClock('2026-07-13T07:30:00Z', 'Europe/Paris')).toEqual({
      hour: 9,
      weekday: MONDAY,
    });
  });

  it("turns the day with the campus's midnight", () => {
    // 22:30 UTC on a Thursday is already Friday 00:30 in Paris (summer).
    expect(campusClock('2026-07-16T22:30:00Z', 'Europe/Paris')).toEqual({
      hour: 0,
      weekday: FRIDAY,
    });
  });
});

describe('firstNameOf', () => {
  it('takes the first word of a full name, title-cased', () => {
    expect(firstNameOf('julien DAVID')).toBe('Julien');
    expect(firstNameOf('  Anne-Sophie Martin ')).toBe('Anne-Sophie');
  });

  it('has nothing to call someone by without a name', () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf('   ')).toBeNull();
  });
});
