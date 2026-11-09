import { describe, it, expect } from 'vitest';
import {
  getEventStatus,
  getLifecycleBounds,
  openingCountdownLine,
} from './eventLifecycle';
import { fromWallClock } from './planningTime';

const PARIS = 'Europe/Paris';
const REUNION = 'Indian/Reunion';

/** How Salesforce stores an event's day: midnight UTC. */
const sfDay = (key: string) => new Date(`${key}T00:00:00Z`);

const statusAt = (
  event: { date: Date; endDate: Date | null },
  at: string,
  tz = PARIS,
) => getEventStatus(event, getLifecycleBounds(tz, new Date(at)));

describe('getEventStatus', () => {
  describe('a single-day event', () => {
    const event = { date: sfDay('2026-10-28'), endDate: null };

    it('is ongoing from the first minute of its campus day', () => {
      // 00:30 in Paris (winter time) is 23:30 UTC the day before: the day is
      // the campus's, not the one `date` was stored under.
      expect(statusAt(event, '2026-10-27T23:30:00Z')).toBe('ongoing');
    });

    it('is ongoing until the last minute of that day', () => {
      expect(statusAt(event, '2026-10-28T22:59:00Z')).toBe('ongoing');
    });

    it('is upcoming the day before and past the day after', () => {
      expect(statusAt(event, '2026-10-27T21:00:00Z')).toBe('upcoming');
      expect(statusAt(event, '2026-10-28T23:01:00Z')).toBe('past');
    });
  });

  describe('a multi-day event', () => {
    it('is ongoing all of its last day when the end is 23:59 campus time', () => {
      const event = {
        date: sfDay('2026-10-26'),
        endDate: fromWallClock('2026-10-30', '23:59', PARIS),
      };
      expect(statusAt(event, '2026-10-28T10:00:00Z')).toBe('ongoing');
      expect(statusAt(event, '2026-10-30T22:58:00Z')).toBe('ongoing');
      expect(statusAt(event, '2026-10-30T23:30:00Z')).toBe('past');
    });

    it('is ongoing all of its last day when the end is stored at UTC midnight', () => {
      // Read « passé » from the first minute of that day under an instant
      // comparison, which is the bug the seed generator documented.
      const event = { date: sfDay('2026-10-26'), endDate: sfDay('2026-10-30') };
      expect(statusAt(event, '2026-10-30T15:00:00Z')).toBe('ongoing');
      expect(statusAt(event, '2026-10-30T23:30:00Z')).toBe('past');
    });
  });

  it('reads the day on the campus clock (La Réunion, UTC+4)', () => {
    const event = { date: sfDay('2026-10-21'), endDate: null };
    // 21:00 UTC on the 21st is already the 22nd in Saint-Denis.
    expect(statusAt(event, '2026-10-21T21:00:00Z', REUNION)).toBe('past');
    // 20:30 UTC on the 20th is 00:30 on the 21st there.
    expect(statusAt(event, '2026-10-20T20:30:00Z', REUNION)).toBe('ongoing');
  });

  it('keeps whole days across a DST change', () => {
    // Paris leaves summer time in the night of 24 to 25 October 2026.
    const event = { date: sfDay('2026-10-25'), endDate: null };
    expect(statusAt(event, '2026-10-24T22:30:00Z')).toBe('ongoing');
    expect(statusAt(event, '2026-10-25T22:59:00Z')).toBe('ongoing');
    expect(statusAt(event, '2026-10-25T23:01:00Z')).toBe('past');
  });
});

describe('openingCountdownLine', () => {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const line = (ms: number) => openingCountdownLine(ms).replaceAll(' ', ' ');

  it('reads days and hours, the hours without a leading zero', () => {
    expect(line(7 * DAY + HOUR + 30 * MIN)).toBe('Ouverture dans 7 j 1 h');
  });

  it('leaves out a unit at zero', () => {
    expect(line(7 * DAY)).toBe('Ouverture dans 7 j');
    expect(line(19 * HOUR + 59 * MIN)).toBe('Ouverture dans 19 h');
  });

  it('counts the minutes under an hour, never down to zero', () => {
    expect(line(42 * MIN)).toBe('Ouverture dans 42 min');
    expect(line(10_000)).toBe('Ouverture dans 1 min');
  });

  it('says the opening has come on a page left open past it', () => {
    expect(line(0)).toBe('Ouverture imminente');
    expect(line(-5 * MIN)).toBe('Ouverture imminente');
  });
});
