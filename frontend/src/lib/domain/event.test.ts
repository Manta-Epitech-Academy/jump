import { describe, it, expect } from 'vitest';
import { eventDaysLabel, eventEndInstant, eventStartInstant } from './event';

const REUNION = 'Indian/Reunion';

describe('eventDaysLabel', () => {
  it('reads the days on the campus clock, not the one it runs on', () => {
    // Midnight in Réunion (UTC+4) is 20:00 UTC the day before: read on any
    // clock west of the campus, the event would start on 11 November.
    const label = eventDaysLabel(
      eventStartInstant('2026-11-12', REUNION),
      eventEndInstant('2026-11-14', REUNION),
      REUNION,
    );
    expect(label).toBe('12 nov. 2026 → 14 nov. 2026');
  });

  it('shows one day for an event that starts and ends on it', () => {
    const label = eventDaysLabel(
      eventStartInstant('2026-11-12', REUNION),
      eventEndInstant('2026-11-12', REUNION),
      REUNION,
    );
    expect(label).toBe('12 nov. 2026');
  });

  it('shows the start day alone when no end is stored', () => {
    expect(
      eventDaysLabel(eventStartInstant('2026-11-12', REUNION), null, REUNION),
    ).toBe('12 nov. 2026');
  });
});
