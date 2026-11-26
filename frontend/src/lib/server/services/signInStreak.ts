import { parseDate } from '@internationalized/date';
import { prisma } from '#lib/server/db.ts';
import { dbDateToKey } from '#lib/domain/eventPresence.ts';
import { toDateKey } from '#lib/domain/planningTime.ts';
import { awardDueBadges } from '#lib/server/services/badgeAwards.ts';

/**
 * Count the day `now` falls on, in `timezone`, into the talent's run of
 * consecutive days (`Talent.streakDays` / `streakLastDay` / `streakPreviousDay`,
 * whose schema comment says what they mean and why they are all there is).
 * Called by `hooks.server.ts` on every request a talent makes themselves.
 *
 * The first visit of a day extends a run whose last day was yesterday and
 * restarts any other at 1, and keeps the day it moves past as
 * `streakPreviousDay`; every later visit that day changes nothing. The
 * talent's loaded `streakLastDay` settles the common case without a write, so a
 * talent costs one write a day, not one per request.
 *
 * The write is ONE conditional statement because the check above is a read of
 * a snapshot: two requests of the same talent, on two pods, can both see
 * yesterday and both decide to extend. The `WHERE` makes the second a no-op,
 * since Postgres re-reads the row it waited on and finds today already there.
 * Strictly earlier, not merely different, so a talent whose campus moves to a
 * zone behind never sees their day go back.
 *
 * The same `WHERE` refuses an erased talent. The erasure deletes the sessions
 * and clears the run, but a request already past the hook loaded the row before
 * it committed, and once the run is cleared the day guard matches again: without
 * `anonymizedAt`, that late write would put a day back on the erased row.
 *
 * Days travel as `YYYY-MM-DD` keys cast to `date`, so no `Date` stands in for a
 * calendar day and no timezone can shift one.
 *
 * The day's write also awards a run-of-days badge the run just reached (#448),
 * in the same transaction: the run only moves here, and it can restart at 1 on
 * the next visit, before any sweep would have seen the day it reached.
 */
export async function recordSignInDay(
  talent: { id: string; streakLastDay: Date | null },
  timezone: string,
  now: Date = new Date(),
): Promise<void> {
  const today = toDateKey(now, timezone);
  if (talent.streakLastDay && dbDateToKey(talent.streakLastDay) >= today) {
    return;
  }
  const yesterday = parseDate(today).subtract({ days: 1 }).toString();
  await prisma.$transaction(async (tx) => {
    const counted = await tx.$executeRaw`
      UPDATE "Talent"
      SET "streakDays" = CASE
            WHEN "streakLastDay" = ${yesterday}::date THEN "streakDays" + 1
            ELSE 1
          END,
          "streakPreviousDay" = "streakLastDay",
          "streakLastDay" = ${today}::date
      WHERE "id" = ${talent.id}
        AND "anonymizedAt" IS NULL
        AND ("streakLastDay" IS NULL OR "streakLastDay" < ${today}::date)
    `;
    if (counted > 0) {
      await awardDueBadges(tx, {
        now,
        talentIds: [talent.id],
        counters: ['signInStreak'],
      });
    }
  });
}

/** The `Talent` patch for "no run at all", which the erasure and the reset write. */
export function clearSignInStreak(): {
  streakDays: 0;
  streakLastDay: null;
  streakPreviousDay: null;
} {
  return { streakDays: 0, streakLastDay: null, streakPreviousDay: null };
}
