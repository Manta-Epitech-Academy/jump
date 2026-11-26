import { cronJob } from '#lib/server/cronJob.ts';
import { prisma } from '#lib/server/db.ts';
import { awardDueBadges } from '#lib/server/services/badgeAwards.ts';

/**
 * Awards every live badge its due (#448), for what no act of the talent writes:
 * an event that has just ended (a visit counts once its event is over, and no
 * write marks that), a status Salesforce sends, an émargement or a closing the
 * staff writes, an admin's configuration, a reward granted from a file. What a
 * talent does themselves is awarded on the spot by the act's own writer
 * (`services/badgeAwards.ts` says which).
 *
 * Intended to run hourly via the external cron service, so a visit's badge
 * follows the event's end within the hour. Idempotent: an award already held
 * is skipped, so running it more often is harmless and running it less often
 * only dates the awards later. Not one transaction: each badge's awards are
 * one statement, and a long transaction over every badge would hold nothing
 * that statement does not already guarantee.
 */
export const POST = cronJob('Badge awards', async () => {
  const awarded = await awardDueBadges(prisma, { now: new Date() });
  console.log(`[Job] Badge awards: ${awarded} awarded.`);
  return { success: true, awarded };
});
