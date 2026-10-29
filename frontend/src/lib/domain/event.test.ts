import { describe, it, expect } from 'vitest';
import { eventDaysLabel, eventEndInstant, eventStartInstant } from './event';

const REUNION = 'Indian/Reunion';

// Read a label the way a person sees it: the no-break spaces that hold each
// day together render as ordinary spaces.
const shown = (label: string) => label.replaceAll(' ', ' ');

describe('eventDaysLabel', () => {
  it('reads the days on the campus clock, not the one it runs on', () => {
    // Midnight in Réunion (UTC+4) is 20:00 UTC the day before: read on any
    // clock west of the campus, the event would start on 11 November.
    const label = eventDaysLabel(
      eventStartInstant('2026-11-12', REUNION),
      eventEndInstant('2026-11-14', REUNION),
      REUNION,
    );
    expect(shown(label)).toBe('du 12 au 14 nov. 2026');
  });

  it('names a month or a year once when both days share it', () => {
    const range = (start: string, end: string) =>
      shown(
        eventDaysLabel(
          eventStartInstant(start, REUNION),
          eventEndInstant(end, REUNION),
          REUNION,
        ),
      );
    expect(range('2026-11-28', '2026-12-03')).toBe('du 28 nov. au 3 déc. 2026');
    expect(range('2026-12-28', '2027-01-02')).toBe(
      'du 28 déc. 2026 au 2 janv. 2027',
    );
  });

  it('writes the first of a month as an ordinal', () => {
    const label = eventDaysLabel(
      eventStartInstant('2027-03-01', REUNION),
      eventEndInstant('2027-03-03', REUNION),
      REUNION,
    );
    expect(shown(label)).toBe('du 1er au 3 mars 2027');
  });

  it('can wrap only before "au", never inside an end', () => {
    const label = eventDaysLabel(
      eventStartInstant('2026-11-28', REUNION),
      eventEndInstant('2026-12-03', REUNION),
      REUNION,
    );
    expect(label.split(' ').map(shown)).toEqual([
      'du 28 nov.',
      'au 3 déc. 2026',
    ]);
  });

  it('shows one day for an event that starts and ends on it', () => {
    const label = eventDaysLabel(
      eventStartInstant('2026-11-12', REUNION),
      eventEndInstant('2026-11-12', REUNION),
      REUNION,
    );
    expect(shown(label)).toBe('12 nov. 2026');
  });

  it('shows the start day alone when no end is stored', () => {
    expect(
      shown(
        eventDaysLabel(eventStartInstant('2026-11-12', REUNION), null, REUNION),
      ),
    ).toBe('12 nov. 2026');
  });
});
