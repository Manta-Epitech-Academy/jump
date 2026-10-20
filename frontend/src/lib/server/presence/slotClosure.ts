import { zonedWallClockInstant } from '$lib/server/eventTime';
import {
  dateKeyParts,
  dbDateToKey,
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
 * a créneau early by hand (an `EventPresenceClosure` row); `isSlotClosed`
 * combines the two. Past the cutoff, the QR refuses new self-check-ins and any
 * still-unmarked talent reads as absent (a projection, never a stored row).
 */
export function isSlotPastCutoff(
  dayKey: DateKey,
  slot: PresenceSlot,
  timezone: string,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= slotCutoffInstant(dayKey, slot, timezone).getTime();
}

/**
 * Whether a créneau is closed for reading: a staff member closed it early (one
 * of `manualCloses`, the event's `EventPresenceClosure` rows) or its cutoff has
 * passed. The one rule the émargement page, its export, the QR scan and the
 * coverage figure read, so a créneau cannot be closed on one and open on another.
 *
 * Writes do not all follow it, on purpose: per-row marking stays open on a
 * closed créneau (the late arrival a staff member records), and the bulk mark
 * refuses only a manual close (`markAllPresentInSlot`).
 */
export function isSlotClosed(
  dayKey: DateKey,
  slot: PresenceSlot,
  manualCloses: readonly { day: Date; slot: PresenceSlot }[],
  timezone: string,
  now: Date = new Date(),
): boolean {
  return (
    isSlotPastCutoff(dayKey, slot, timezone, now) ||
    manualCloses.some((c) => c.slot === slot && dbDateToKey(c.day) === dayKey)
  );
}
