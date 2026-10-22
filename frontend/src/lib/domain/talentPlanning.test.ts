import { describe, it, expect } from 'vitest';
import {
  showsSessionCard,
  toCalendarPlanning,
  toPlanningView,
} from './talentPlanning';
import { eventEndInstant, eventStartInstant } from './event';

describe('the home’s session card', () => {
  const event = (planningSlots: unknown[]) => ({
    event: {
      publicName: 'Stage de seconde',
      date: new Date('2026-10-12T00:00:00Z'),
      startMinutes: 9 * 60,
      planningSlots,
    },
  });

  it('leads into a running event’s schedule only when it has one', () => {
    expect(showsSessionCard(toPlanningView(event([{ id: 's' }]), null))).toBe(
      true,
    );
    expect(showsSessionCard(toPlanningView(event([]), null))).toBe(false);
  });

  it('gives the next session’s date, and nothing when none is planned', () => {
    expect(showsSessionCard(toPlanningView(null, event([])))).toBe(true);
    expect(showsSessionCard(toPlanningView(null, null))).toBe(false);
  });
});

describe('the talent calendar’s range', () => {
  // Réunion midnight is the evening before in Paris, where the pods run: a
  // range cut to a day on the server's clock opened the grid a day early. The
  // viewer cuts it, on its own clock, so the bounds go out untouched.
  it('spans the stored instants, leaving the day to the viewer', () => {
    const date = eventStartInstant('2026-07-06', 'Indian/Reunion');
    const endDate = eventEndInstant('2026-07-10', 'Indian/Reunion');
    const single = eventStartInstant('2026-07-20', 'Indian/Reunion');
    const event = (over: { date: Date; endDate: Date | null }) => ({
      event: { id: 'e', titre: 'Stage', planningSlots: [], ...over },
    });

    expect(
      toCalendarPlanning([
        event({ date, endDate }),
        event({ date: single, endDate: null }),
      ]).range,
    ).toEqual({ start: date, end: single });
  });
});
