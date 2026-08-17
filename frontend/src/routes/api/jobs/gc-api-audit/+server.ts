import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { safeTokenEquals } from '$lib/server/auth/safeTokenCompare';
import { purgeAdminApiCalls } from '$lib/server/adminApi/audit';

/**
 * Trims the curated-admin-API call log. A row is written on every call
 * (successes and refusals), so the table only grows; the pilot reads recent
 * history, never year-old rows.
 *
 * Retention is long enough to investigate an incident after the fact and to run
 * a quarterly look at what the team actually asks for. Same Bearer-token
 * contract as the other cron jobs (see /api/jobs/anonymize). Expected schedule:
 * weekly.
 */
const RETENTION_DAYS = 180;

export const POST: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret || !token || !safeTokenEquals(token, cronSecret)) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  try {
    const { deleted } = await purgeAdminApiCalls(RETENTION_DAYS);
    console.log(
      `[Job] gc-api-audit completed: ${deleted} call(s) older than ${RETENTION_DAYS} days removed.`,
    );
    return json({ success: true, deleted, retentionDays: RETENTION_DAYS });
  } catch (err) {
    console.error('[Job] gc-api-audit failed:', err);
    throw error(500, 'Internal Server Error');
  }
};
