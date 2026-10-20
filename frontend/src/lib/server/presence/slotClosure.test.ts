import { describe, it, expect } from 'vitest';
import type { PresenceSlot } from '$lib/domain/eventPresence';
import { isSlotPastCutoff } from './slotClosure';

/**
 * A créneau closes on the campus wall clock (11h00 for the morning, 15h00 for
 * the afternoon), whatever offset the zone has that day. Closure is derived from
 * the clock rather than written by a job, so this function alone decides when
 * the QR stops accepting a scan and when an unmarked talent starts reading as
 * absent.
 */
function closesAt(
  day: string,
  slot: PresenceSlot,
  timezone: string,
  instant: string,
) {
  const at = new Date(instant);
  const minuteBefore = new Date(at.getTime() - 60_000);
  expect(isSlotPastCutoff(day, slot, timezone, minuteBefore)).toBe(false);
  expect(isSlotPastCutoff(day, slot, timezone, at)).toBe(true);
}

describe('isSlotPastCutoff', () => {
  it('closes a Paris morning at 11h00 winter time', () => {
    closesAt('2026-03-27', 'morning', 'Europe/Paris', '2026-03-27T10:00:00Z');
  });

  it('closes a Paris morning at 11h00 on the day the clocks go forward', () => {
    closesAt('2026-03-29', 'morning', 'Europe/Paris', '2026-03-29T09:00:00Z');
  });

  it('closes a Paris morning at 11h00 summer time', () => {
    closesAt('2026-03-30', 'morning', 'Europe/Paris', '2026-03-30T09:00:00Z');
  });

  it('closes a Paris afternoon at 15h00 on each side of the clocks going back', () => {
    closesAt('2026-10-23', 'afternoon', 'Europe/Paris', '2026-10-23T13:00:00Z');
    closesAt('2026-10-26', 'afternoon', 'Europe/Paris', '2026-10-26T14:00:00Z');
  });

  it('closes on La Réunion wall clock, which has no daylight saving', () => {
    closesAt('2026-10-26', 'morning', 'Indian/Reunion', '2026-10-26T07:00:00Z');
    closesAt(
      '2026-10-26',
      'afternoon',
      'Indian/Reunion',
      '2026-10-26T11:00:00Z',
    );
  });

  it('lands on the right day in a zone behind UTC', () => {
    closesAt(
      '2026-06-10',
      'morning',
      'America/Martinique',
      '2026-06-10T15:00:00Z',
    );
  });
});
