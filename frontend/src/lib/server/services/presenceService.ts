import { scopedPrisma } from '$lib/server/db/scoped';
import { dbDateToKey, type PresenceSlot } from '$lib/domain/eventPresence';
import { isSlotPastCutoff } from '$lib/server/presence/slotClosure';

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

/**
 * Whether a (day, slot) is closed right now: either a staff member closed it
 * early (an `EventPresenceClosure` row) or its 11h/15h cutoff has passed. The
 * single-slot mirror of the set-based closed/cutoff projection the page load
 * computes for the whole grid. Checks the clock first (no DB round-trip) before
 * looking for a manual closure row.
 */
async function isPresenceSlotClosed(
  campusId: string,
  eventId: string,
  day: Date,
  slot: PresenceSlot,
  timezone: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (isSlotPastCutoff(dbDateToKey(day), slot, timezone, now)) return true;
  const closure = await scopedPrisma(campusId).eventPresenceClosure.findUnique({
    where: { eventId_day_slot: { eventId, day, slot } },
    select: { eventId: true },
  });
  return closure !== null;
}

export type MarkAllPresentResult =
  | { status: 'closed' }
  | { status: 'done'; marked: number };

/**
 * Bulk "tout présent" for one créneau: fill every still-"en attente" cell with a
 * present mark, leaving any already-saved status (absent, justifié, en retard,
 * present) untouched. The expected roster is read from Participation (the same
 * Salesforce mirror the load reads), and a single `createMany` with
 * `skipDuplicates` against the (talent, event, day, slot) unique key inserts
 * only where no row exists yet, so it never clobbers a deliberate mark.
 *
 * Refuses a closed créneau (`status: 'closed'`). On a closed slot the pending
 * cells already *read* as absent (a projection over the whole roster), so a bulk
 * present would silently flip a slot's worth of absences to present and inflate
 * the attendance rate, with no stored row to show it happened. Once closed the
 * only way back in is a deliberate per-row correction (or reopening the slot),
 * which mirrors how the QR refuses self-check-ins past the cutoff. Enforced here,
 * not in the action, so no caller can bypass it (the on-screen button is already
 * hidden once a slot closes, but a stale page can still POST after the cutoff).
 */
export async function markAllPresentInSlot(
  campusId: string,
  eventId: string,
  day: Date,
  slot: PresenceSlot,
  timezone: string,
  markedById: string | null,
): Promise<MarkAllPresentResult> {
  const db = scopedPrisma(campusId);
  if (await isPresenceSlotClosed(campusId, eventId, day, slot, timezone)) {
    return { status: 'closed' };
  }

  const roster = await db.participation.findMany({
    where: { eventId },
    select: { talentId: true },
  });
  const now = new Date();
  const { count } = await db.eventPresence.createMany({
    data: roster.map((p) => ({
      talentId: p.talentId,
      eventId,
      day,
      slot,
      status: 'present' as const,
      source: 'manual' as const,
      markedById,
      markedAt: now,
    })),
    skipDuplicates: true,
  });

  return { status: 'done', marked: count };
}
