import { scopedPrisma } from '$lib/server/db/scoped';
import type { PresenceSlot } from '$lib/domain/eventPresence';

// Émargement is autonomous from Participation, but the roster of who is expected
// is still read from Participation (the Salesforce campaign-member mirror).
//
// A créneau closes in one of two ways, and BOTH are derived on read, never
// materialised as absent rows:
//   - automatically, once its 11h/15h cutoff passes (see `slotClosure.ts`); this
//     needs no job, it is a pure function of the clock;
//   - early, when a staff member closes it by hand, which writes the
//     `EventPresenceClosure` row managed below.
// Either way, a still-unmarked talent in a closed créneau simply *reads* as
// absent (`effectiveStatus`), and the QR refuses new self-check-ins.

/**
 * Close a (day, slot) early, before its automatic cutoff: record who/when in an
 * `EventPresenceClosure` row. That immediately turns still-unmarked talents
 * absent (a projection, computed on read) and stops QR self-check-in. Idempotent
 * (upsert). `closedById` is the acting staff member. Scoped by `campusId` so
 * the closure can only ever touch an event on the acting staff's campus.
 */
export async function closePresenceSlot(
  campusId: string,
  eventId: string,
  day: Date,
  slot: PresenceSlot,
  closedById: string | null,
): Promise<void> {
  await scopedPrisma(campusId).eventPresenceClosure.upsert({
    where: { eventId_day_slot: { eventId, day, slot } },
    create: { eventId, day, slot, closedById },
    update: { closedById, closedAt: new Date() },
  });
}

/**
 * Cancel a manual early-close: drop the `EventPresenceClosure` row. Only
 * meaningful before the cutoff, past it the créneau stays auto-closed by the
 * clock. Manual marks are untouched (absences were never stored, so there is
 * nothing to revert), and the QR works again.
 */
export async function reopenPresenceSlot(
  campusId: string,
  eventId: string,
  day: Date,
  slot: PresenceSlot,
): Promise<void> {
  await scopedPrisma(campusId).eventPresenceClosure.deleteMany({
    where: { eventId, day, slot },
  });
}
