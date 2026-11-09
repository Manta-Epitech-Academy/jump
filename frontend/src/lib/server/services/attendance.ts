/**
 * The one writer of `Participation.attendanceAttested`, the projection of
 * whether something attests that a talent came to an event (the rule:
 * `domain/attendance.ts`).
 *
 * Four tables can hold a proof, and each of their writers calls this inside its
 * own transaction, so the projection never disagrees with the rows it was read
 * from: the status policy (`devSpaceVisibility.ts`) and the sync, the
 * émargement, the closings, the activities, and the three operations that move
 * or delete a talent's rows (erasure, reset to import, merge).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '$lib/server/db';
import { ATTENDANCE_PROOF_SQL } from '$lib/domain/attendance';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Re-derive the projection for every enrolment of these events and of these
 * talents. Whole rosters rather than single rows: a roster is two hundred rows
 * at most, and one rule for every caller is worth more than the rows it saves.
 */
export async function recomputeAttendance(
  db: Db,
  scope: { eventIds?: readonly string[]; talentIds?: readonly string[] },
): Promise<void> {
  const eventIds = [...(scope.eventIds ?? [])];
  const talentIds = [...(scope.talentIds ?? [])];
  if (eventIds.length === 0 && talentIds.length === 0) return;
  await db.$executeRaw`
    UPDATE "Participation" p
    SET "attendanceAttested" = ${Prisma.raw(ATTENDANCE_PROOF_SQL)}
    WHERE p."eventId" = ANY(${eventIds}::text[])
       OR p."talentId" = ANY(${talentIds}::text[])
  `;
}
