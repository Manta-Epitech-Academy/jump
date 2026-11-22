import { describe, it, expect } from 'vitest';
import { splitTodayAndUpcoming } from './parent';
import { eventStartInstant } from './event';

const participation = (id: string, day: string, timezone: string) => ({
  id,
  event: { date: eventStartInstant(day, timezone), campus: { timezone } },
});

describe("the parent page's day", () => {
  // The day used to be cut on a timezone the parent space never learns, so on
  // Paris's: an event starting today at La Réunion was still « à venir » there.
  it("reads today on the event's campus clock", () => {
    const reunion = participation('reunion', '2026-07-06', 'Indian/Reunion');
    // Monday 6 July, 09:00 at La Réunion: still Sunday 23:00 in Montréal.
    const now = new Date('2026-07-06T05:00:00Z');

    expect(splitTodayAndUpcoming([reunion], now)).toEqual({
      today: reunion,
      upcoming: [],
    });
  });

  it('lists the later events and drops the past ones', () => {
    const past = participation('past', '2026-03-02', 'Europe/Paris');
    const today = participation('today', '2026-07-06', 'Europe/Paris');
    const later = participation('later', '2026-10-19', 'Europe/Paris');
    const now = new Date('2026-07-06T12:00:00Z');

    expect(splitTodayAndUpcoming([past, today, later], now)).toEqual({
      today,
      upcoming: [later],
    });
  });
});
