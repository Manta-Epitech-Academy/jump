/**
 * The one writer of `Participation.attendanceAttested`, the projection of
 * whether something attests that a talent came to an event (the rule:
 * `domain/attendance.ts`).
 *
 * Three tables can hold a proof, and each of their writers calls this inside
 * its own transaction, so the projection never disagrees with the rows it was
 * read from: the status policy (`devSpaceVisibility.ts`), the émargement
 * (`presenceService.ts`), the closings, and the three operations that move or
 * delete a talent's rows (erasure, reset to import, merge).
 *
 * The sync is the one writer outside a transaction: it upserts a roster member
 * by member and re-derives the event once the roster is written, as it does
 * `shownInDevSpace`. A pass cut short leaves the event stale until the next
 * pass that writes to it, which re-derives the whole roster again.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { ATTENDANCE_PROOF_SQL } from '$lib/domain/attendance';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Re-derive the projection for every enrolment of these events and of these
 * talents. Whole rosters rather than single rows: a roster is two hundred rows
 * at most, and one rule for every caller is worth more than the rows it saves.
 *
 * Only the rows whose value moves are written. The émargement calls this on
 * every scan and every click, and the closings on every autosave: rewriting
 * the whole roster each time would lock every enrolment of the event until
 * commit, so the scans of a 9am rush would queue behind each other.
 */
export async function recomputeAttendance(
  db: Db,
  scope: { eventIds?: readonly string[]; talentIds?: readonly string[] },
): Promise<void> {
  const eventIds = [...(scope.eventIds ?? [])];
  const talentIds = [...(scope.talentIds ?? [])];
  if (eventIds.length === 0 && talentIds.length === 0) return;
  const proof = Prisma.raw(ATTENDANCE_PROOF_SQL);
  await db.$executeRaw`
    UPDATE "Participation" p
    SET "attendanceAttested" = ${proof}
    WHERE (p."eventId" = ANY(${eventIds}::text[])
       OR p."talentId" = ANY(${talentIds}::text[]))
      AND p."attendanceAttested" IS DISTINCT FROM ${proof}
  `;
}
