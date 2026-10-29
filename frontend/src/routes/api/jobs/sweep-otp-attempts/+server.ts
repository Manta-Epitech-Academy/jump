import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { safeTokenEquals } from '$lib/server/auth/safeTokenCompare';
import { sweepExpiredAttempts } from '$lib/server/auth/rateLimiter';

/**
 * Drops each `OtpAttempt` row once its bucket's rate-limit window is over
 * (`sweepExpiredAttempts`). The limiter never reads rows past that cutoff, so
 * anything older is dead weight naming an address; sweeping also keeps the
 * hot index small.
 *
 * Intended to run hourly via the external cron service (same pattern as the
 * other `/api/jobs/...` endpoints). The sweep is idempotent: running it more
 * often is harmless, running it less often just lets the table grow until the
 * next pass.
 */
export const POST: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = env.CRON_SECRET;

  if (!cronSecret || !token || !safeTokenEquals(token, cronSecret)) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  try {
    const count = await sweepExpiredAttempts();
    console.log(`[Job] OTP attempt sweep: ${count} rows deleted.`);
    return json({ success: true, deleted: count });
  } catch (err) {
    console.error('[Job] OTP attempt sweep failed:', err);
    throw error(500, 'Internal Server Error');
  }
};
