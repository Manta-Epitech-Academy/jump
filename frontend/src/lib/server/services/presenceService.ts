import { prisma } from '$lib/server/db';
import { scopedPrisma } from '$lib/server/db/scoped';
import {
  recomputeEventsCount,
  recomputeEventsCountBulk,
} from '$lib/server/services/xpService';
import { recomputeAttendance } from './attendance';
import type {
  CellStatus,
  PresenceSlot,
  PresenceSource,
} from '$lib/domain/eventPresence';
import { visibleParticipationWhere } from '$lib/domain/sfMemberStatus';

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
 *
 * Returns how many of the roster now read absent because of it: the members the
 * sheet lists who carry no mark on this créneau. Nothing is written for them,
 * so the number is counted here, at the moment it becomes true, for the person
 * who closed the créneau to read back.
 */
export async function closePresenceSlot(
  campusId: string,
  eventId: string,
  day: Date,
  slot: PresenceSlot,
  closedById: string | null,
): Promise<{ absent: number }> {
  const db = scopedPrisma(campusId);
  const [roster, marked] = await Promise.all([
    db.participation.findMany({
      where: { eventId, ...visibleParticipationWhere },
      select: { talentId: true },
    }),
    db.eventPresence.findMany({
      where: { eventId, day, slot },
      select: { talentId: true },
    }),
    db.eventPresenceClosure.upsert({
      where: { eventId_day_slot: { eventId, day, slot } },
      create: { eventId, day, slot, closedById },
      update: { closedById, closedAt: new Date() },
    }),
  ]);
  const hasMark = new Set(marked.map((m) => m.talentId));
  return { absent: roster.filter((p) => !hasMark.has(p.talentId)).length };
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
 * Write one émargement cell, a staff member's mark or a talent's QR scan, and
 * re-derive the two projections a cell feeds in the same transaction: the
 * talent's `eventsCount` and the dev space's « venu » (`attendance.ts`). A
 * `pending` mark clears the cell (the row goes), which can take either back.
 *
 * Who may write the cell is the caller's to settle first: the staff route
 * scopes the event to its campus and the talent to its sheet, the QR route
 * verifies its token and refuses to overwrite a manual mark.
 */
export async function writePresenceCell(
  cell: { talentId: string; eventId: string; day: Date; slot: PresenceSlot },
  mark: {
    status: CellStatus;
    source: Exclude<PresenceSource, 'system'>;
    markedById: string | null;
  },
): Promise<void> {
  const { talentId, eventId, day, slot } = cell;
  await prisma.$transaction(async (tx) => {
    if (mark.status === 'pending') {
      await tx.eventPresence.deleteMany({
        where: { talentId, eventId, day, slot },
      });
    } else {
      const written = {
        status: mark.status,
        source: mark.source,
        markedById: mark.markedById,
        markedAt: new Date(),
      };
      await tx.eventPresence.upsert({
        where: { talentId_eventId_day_slot: cell },
        create: { ...cell, ...written },
        update: written,
      });
    }
    await recomputeEventsCount(tx, talentId);
    await recomputeAttendance(tx, { eventIds: [eventId] });
  });
}

export type MarkAllPresentResult =
  { status: 'closed' } | { status: 'done'; marked: number };

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
 * late and forcing 200 marks by hand would be the only alternative. That is why
 * it reads the closure row itself rather than `isSlotClosed`. Unmarked
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
    where: { eventId, ...visibleParticipationWhere },
    select: { talentId: true },
  });

  const now = new Date();
  const count = await prisma.$transaction(async (tx) => {
    // Snapshot who already carries a présent/en-retard cell for this event
    // BEFORE inserting: bulk-marking another slot can't change whether they
    // attended, so their `eventsCount` is untouched and we skip recomputing
    // them. Only talents who gain their first attendance here (bounded by the
    // roster, not the campus) need the projection refreshed. `eventId` is already
    // campus-authorized by the caller's scoped event load.
    const alreadyAttending = new Set(
      (
        await tx.eventPresence.findMany({
          where: { eventId, status: { in: ['present', 'late'] } },
          distinct: ['talentId'],
          select: { talentId: true },
        })
      ).map((r) => r.talentId),
    );

    const { count } = await tx.eventPresence.createMany({
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

    await recomputeEventsCountBulk(
      tx,
      roster.map((p) => p.talentId).filter((id) => !alreadyAttending.has(id)),
    );
    await recomputeAttendance(tx, { eventIds: [eventId] });

    return count;
  });

  return { status: 'done', marked: count };
}
