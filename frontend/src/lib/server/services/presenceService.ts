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
 * Refuses only a *manual* early-close (`status: 'closed'`): a staff member
 * deliberately closed the créneau, so reopening it (Rouvrir) is the way back in.
 * A clock-closed créneau (past its 11h/15h cutoff) still accepts the bulk mark,
 * mirroring per-row marking which is always allowed: staff are often émargeant
 * late and forcing 200 marks by hand would be the only alternative. Unmarked
 * cells carry no stored row, so `createMany` + `skipDuplicates` only ever inserts
 * present where nothing was saved and never clobbers a deliberate absent/justifié.
 */
export async function markAllPresentInSlot(
  campusId: string,
  eventId: string,
  day: Date,
  slot: PresenceSlot,
  markedById: string | null,
): Promise<MarkAllPresentResult> {
  const db = scopedPrisma(campusId);
  const manualClosure = await db.eventPresenceClosure.findUnique({
    where: { eventId_day_slot: { eventId, day, slot } },
    select: { eventId: true },
  });
  if (manualClosure) return { status: 'closed' };

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
