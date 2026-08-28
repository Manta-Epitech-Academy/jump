import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { safeTokenEquals } from '$lib/server/auth/safeTokenCompare';
import {
  rollUpUsage,
  USAGE_RAW_RETENTION_MONTHS,
} from '$lib/server/usage/rollup';

/**
 * Folds usage rows into the monthly cube, then purges the raw rows past the
 * retention window. See `rollUpUsage` for why those two are one job and why the
 * order matters.
 *
 * Same Bearer-token contract as the other cron jobs (see /api/jobs/anonymize),
 * including failing closed when CRON_SECRET is unset. Expected schedule: weekly.
 * The window is far wider than the cadence, so a missed run loses nothing.
 */
export const POST: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret || !token || !safeTokenEquals(token, cronSecret)) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  try {
    const result = await rollUpUsage();
    console.log(
      `[Job] usage-rollup completed: ${result.monthsFolded} month(s) folded into ${result.rowsWritten} row(s), ${result.rawPurged} raw row(s) older than ${USAGE_RAW_RETENTION_MONTHS} months removed.`,
    );
    return json({ success: true, ...result });
  } catch (err) {
    console.error('[Job] usage-rollup failed:', err);
    throw error(500, 'Internal Server Error');
  }
};
