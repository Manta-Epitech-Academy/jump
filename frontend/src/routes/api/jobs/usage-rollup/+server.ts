import { cronJob } from '#lib/server/cronJob.ts';
import {
  rollUpUsage,
  USAGE_RAW_RETENTION_MONTHS,
} from '#lib/server/usage/rollup.ts';

/**
 * Folds usage rows into the monthly cube, then purges the raw rows past the
 * retention window. See `rollUpUsage` for why those two are one job and why the
 * order matters.
 *
 * Expected schedule: weekly. The window is far wider than the cadence, so a
 * missed run loses nothing.
 */
export const POST = cronJob('usage-rollup', async () => {
  const result = await rollUpUsage();
  console.log(
    `[Job] usage-rollup completed: ${result.monthsFolded} month(s) folded into ${result.rowsWritten} row(s), ${result.rawPurged} raw row(s) older than ${USAGE_RAW_RETENTION_MONTHS} months removed.`,
  );
  return { success: true, ...result };
});
