import { cronJob } from '#lib/server/cronJob.ts';
import { sweepExpiredAttempts } from '#lib/server/auth/rateLimiter.ts';

/**
 * Drops each `OtpAttempt` row once its bucket's rate-limit window is over
 * (`sweepExpiredAttempts`). The limiter never reads rows past that cutoff, so
 * anything older is dead weight naming an address; sweeping also keeps the
 * hot index small.
 *
 * Intended to run hourly via the external cron service. The sweep is
 * idempotent: running it more often is harmless, running it less often just
 * lets the table grow until the next pass.
 */
export const POST = cronJob('OTP attempt sweep', async () => {
  const count = await sweepExpiredAttempts();
  console.log(`[Job] OTP attempt sweep: ${count} rows deleted.`);
  return { success: true, deleted: count };
});
