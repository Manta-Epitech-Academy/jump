import { cronJob } from '#lib/server/cronJob.ts';
import { purgeAdminApiCalls } from '#lib/server/adminApi/audit.ts';

/**
 * Trims the curated-admin-API call log. A row is written on every call
 * (successes and refusals), so the table only grows; the pilot reads recent
 * history, never year-old rows.
 *
 * Retention is long enough to investigate an incident after the fact and to run
 * a quarterly look at what the team actually asks for. Expected schedule:
 * weekly.
 */
const RETENTION_DAYS = 180;

export const POST = cronJob('gc-api-audit', async () => {
  const { deleted } = await purgeAdminApiCalls(RETENTION_DAYS);
  console.log(
    `[Job] gc-api-audit completed: ${deleted} call(s) older than ${RETENTION_DAYS} days removed.`,
  );
  return { success: true, deleted, retentionDays: RETENTION_DAYS };
});
