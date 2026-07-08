import { zonedWallClockInstant } from '$lib/server/eventTime';
import {
  dateKeyParts,
  type DateKey,
  type PresenceSlot,
} from '$lib/domain/eventPresence';

/**
 * Wall-clock cutoff per half-day, minutes from local midnight (campus tz):
 * a morning créneau closes at 11h00, an afternoon one at 15h00.
 */
const SLOT_CUTOFF_MINUTES: Record<PresenceSlot, number> = {
  morning: 11 * 60, // 11h00
  afternoon: 15 * 60, // 15h00
};

/**
 * The instant a half-day auto-closes, resolved in the campus timezone. Takes the
 * créneau's calendar-day key directly (not a `Date`) so the cutoff lands on the
 * right local day in every zone, including negative-offset campuses.
 */
function slotCutoffInstant(
  dayKey: DateKey,
  slot: PresenceSlot,
  timezone: string,
): Date {
  const { year, month, day } = dateKeyParts(dayKey);
  return zonedWallClockInstant(
    year,
    month,
    day,
    SLOT_CUTOFF_MINUTES[slot],
    timezone,
  );
}

/**
 * Whether a créneau's wall-clock cutoff has passed (11h / 15h, campus tz).
 *
 * This is the heart of "the créneau auto-closes": closure is DERIVED from the
 * clock, not written by a job. So it is true the instant the cutoff passes, in
 * every pod, with no cron to run, lag, or forget. A staff member can also close
 * a créneau early by hand (an `EventPresenceClosure` row); the two combine as
 * `manualClosure || isSlotPastCutoff(...)`. Past the cutoff, the QR refuses new
 * self-check-ins and any still-unmarked talent reads as absent (a projection,
 * never a stored row).
 */
export function isSlotPastCutoff(
  dayKey: DateKey,
  slot: PresenceSlot,
  timezone: string,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= slotCutoffInstant(dayKey, slot, timezone).getTime();
}
