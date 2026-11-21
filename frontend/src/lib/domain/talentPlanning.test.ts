import { describe, it, expect } from 'vitest';
import { toCalendarPlanning } from './talentPlanning';
import { eventEndInstant, eventStartInstant } from './event';

describe('the talent calendar’s range', () => {
  // Réunion midnight is the evening before in Paris, where the pods run: a
  // range cut to a day on the server's clock opened the grid a day early. The
  // viewer cuts it, on its own clock, so the bounds go out untouched.
  it('spans the stored instants, leaving the day to the viewer', () => {
    const date = eventStartInstant('2026-07-06', 'Indian/Reunion');
    const endDate = eventEndInstant('2026-07-10', 'Indian/Reunion');
    const single = eventStartInstant('2026-07-20', 'Indian/Reunion');
    const event = (over: { date: Date; endDate: Date | null }) => ({
      event: { id: 'e', publicName: 'Stage', planningSlots: [], ...over },
    });

    expect(
      toCalendarPlanning([
        event({ date, endDate }),
        event({ date: single, endDate: null }),
      ]).range,
    ).toEqual({ start: date, end: single });
  });
});
