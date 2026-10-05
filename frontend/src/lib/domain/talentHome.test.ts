import { describe, it, expect } from 'vitest';
import { formatHighlightDay, isHighlightOpen } from './talentHome';

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

describe('isHighlightOpen', () => {
  it('stays open all of its own day, and closes the next', () => {
    // 23:30 in Paris on 7 October (CEST, UTC+2).
    expect(
      isHighlightOpen(
        day('2026-10-07'),
        'Europe/Paris',
        new Date('2026-10-07T21:30:00Z'),
      ),
    ).toBe(true);
    // 00:30 in Paris on 8 October.
    expect(
      isHighlightOpen(
        day('2026-10-07'),
        'Europe/Paris',
        new Date('2026-10-07T22:30:00Z'),
      ),
    ).toBe(false);
  });

  it('reads the day on the campus clock, not on the server’s', () => {
    // 20:30 UTC on 7 October is already 8 October in La Réunion (UTC+4).
    const now = new Date('2026-10-07T20:30:00Z');
    expect(isHighlightOpen(day('2026-10-07'), 'Indian/Reunion', now)).toBe(
      false,
    );
    expect(isHighlightOpen(day('2026-10-07'), 'Europe/Paris', now)).toBe(true);
  });
});

describe('formatHighlightDay', () => {
  it('names the day itself, whatever the reader’s timezone', () => {
    expect(formatHighlightDay('2026-10-07')).toBe('mercredi 7 octobre');
  });
});
