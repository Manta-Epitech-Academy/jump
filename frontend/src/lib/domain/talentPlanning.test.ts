import { describe, it, expect } from 'vitest';
import { toCalendarPlanning } from './talentPlanning';
import { eventEndInstant, eventStartInstant } from './event';

const REUNION = 'Indian/Reunion';
const PARIS = 'Europe/Paris';

const participation = (over: {
  id?: string;
  date: Date;
  endDate: Date | null;
  timezone: string;
}) => ({
  event: {
    id: over.id ?? 'e',
    publicName: 'Stage',
    date: over.date,
    endDate: over.endDate,
    campus: { timezone: over.timezone },
    planningSlots: [],
  },
});

describe('the talent calendar’s grid', () => {
  // Réunion midnight is the evening before in Paris, where the pods run, and
  // earlier still in the talent's browser abroad: the grid opened a day early
  // until each event's days were read on its own campus clock.
  it("spans each event's days on its campus clock", () => {
    const { grid } = toCalendarPlanning(
      [
        participation({
          date: eventStartInstant('2026-07-06', REUNION),
          endDate: eventEndInstant('2026-07-10', REUNION),
          timezone: REUNION,
        }),
        participation({
          date: eventStartInstant('2026-07-20', REUNION),
          endDate: null,
          timezone: REUNION,
        }),
      ],
      new Date('2026-07-01T08:00:00Z'),
    );

    expect(grid).toEqual({
      start: '2026-07-06',
      end: '2026-07-20',
      timezone: REUNION,
    });
  });

  it('reads the grid on the campus of the event closest to now', () => {
    const paris = participation({
      id: 'paris',
      date: eventStartInstant('2026-03-02', PARIS),
      endDate: eventEndInstant('2026-03-06', PARIS),
      timezone: PARIS,
    });
    const reunion = participation({
      id: 'reunion',
      date: eventStartInstant('2026-07-06', REUNION),
      endDate: eventEndInstant('2026-07-10', REUNION),
      timezone: REUNION,
    });

    expect(
      toCalendarPlanning([paris, reunion], new Date('2026-03-04T10:00:00Z'))
        .grid?.timezone,
    ).toBe(PARIS);
    expect(
      toCalendarPlanning([paris, reunion], new Date('2026-06-30T10:00:00Z'))
        .grid?.timezone,
    ).toBe(REUNION);
  });

  // A single-day event has no end of its own: read as ending at its start, it
  // was hours away on its own evening, and the grid went to a campus whose
  // event only started the next day.
  it('counts a single-day event as running for its whole day', () => {
    const paris = participation({
      id: 'paris',
      date: eventStartInstant('2026-07-06', PARIS),
      endDate: null,
      timezone: PARIS,
    });
    const reunion = participation({
      id: 'reunion',
      date: eventStartInstant('2026-07-07', REUNION),
      endDate: eventEndInstant('2026-07-10', REUNION),
      timezone: REUNION,
    });

    // 20:00 in Paris, 22:00 at La Réunion: two hours before its event starts.
    expect(
      toCalendarPlanning([paris, reunion], new Date('2026-07-06T18:00:00Z'))
        .grid?.timezone,
    ).toBe(PARIS);
  });

  it('has no grid without an event', () => {
    expect(toCalendarPlanning([], new Date()).grid).toBeNull();
  });
});
