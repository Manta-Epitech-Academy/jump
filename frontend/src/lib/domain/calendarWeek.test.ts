import { describe, it, expect } from 'vitest';
import {
  addWeeks,
  mondayOf,
  pickInitialWeek,
  pickInitialWeekView,
  weekDaysFrom,
  weekLabel,
  weeksBetween,
} from './calendarWeek';

const PARIS = 'Europe/Paris';
const REUNION = 'Indian/Reunion';

describe('the planning week, on the campus clock', () => {
  // A recruiter in Montréal opened a Paris event's planning on the wrong day:
  // the grid read each slot's day on the browser's clock. Every day here is
  // read on the campus clock passed in, so the runtime's own timezone (the
  // browser's, or the pod's) has nothing to move.
  it("opens on the week of the campus's day, not the reader's", () => {
    // Monday 9 March 2026, 00:30 in Paris: still Sunday 8 March in Montréal.
    const slot = { startTime: '2026-03-08T23:30:00Z' };
    const now = Date.parse('2026-03-09T10:00:00Z');

    expect(pickInitialWeek(now, [slot], null, PARIS)).toBe('2026-03-09');
    expect(pickInitialWeek(now, [slot], null, 'America/Montreal')).toBe(
      '2026-03-02',
    );
  });

  it('opens on the slot closest to today', () => {
    const now = Date.parse('2026-05-20T08:00:00Z');
    const slots = [
      { startTime: '2026-03-02T08:00:00Z' },
      { startTime: '2026-05-28T08:00:00Z' },
      { startTime: '2026-09-14T08:00:00Z' },
    ];

    expect(pickInitialWeek(now, slots, null, PARIS)).toBe('2026-05-25');
  });

  it('falls back to the week of the given day without a slot', () => {
    expect(pickInitialWeek(Date.now(), [], '2026-07-09', REUNION)).toBe(
      '2026-07-06',
    );
  });

  it('opens full when a slot falls on a weekend of the campus', () => {
    // Friday 20:30 UTC: 22:30 in Paris, already Saturday 00:30 at La Réunion.
    const slots = [{ startTime: '2026-07-10T20:30:00Z' }];

    expect(pickInitialWeekView(slots, REUNION)).toBe('full');
    expect(pickInitialWeekView(slots, PARIS)).toBe('work');
  });

  it('pages whole weeks across a change of hour', () => {
    // Paris moves its clocks on Sunday 29 March 2026.
    expect(addWeeks('2026-03-23', 1)).toBe('2026-03-30');
    expect(addWeeks('2026-03-30', -1)).toBe('2026-03-23');
    expect(weekDaysFrom('2026-03-23', 7)).toEqual([
      '2026-03-23',
      '2026-03-24',
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
    ]);
  });

  it('counts weeks between the weeks two days fall in', () => {
    expect(mondayOf('2026-03-29')).toBe('2026-03-23');
    expect(weeksBetween('2026-03-29', '2026-03-30')).toBe(1);
    expect(weeksBetween('2026-03-30', '2026-03-23')).toBe(-1);
  });

  it('labels the week from its own days', () => {
    expect(weekLabel(weekDaysFrom('2026-11-30', 5))).toBe(
      '30 nov. - 4 déc. 2026',
    );
  });
});
