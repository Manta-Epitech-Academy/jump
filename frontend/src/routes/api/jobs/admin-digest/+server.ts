import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { safeTokenEquals } from '$lib/server/auth/safeTokenCompare';
import { sendAdminDigest } from '$lib/server/services/adminDigest';

/**
 * Weekly admin digest. Expected schedule: Monday morning, Europe/Paris. As a k8s
 * CronJob (UTC): `0 6 * * 1` gives 08:00 Paris in summer, 07:00 in winter. The
 * exact hour does not matter to the content, so no DST handling is needed.
 *
 * Same bearer contract as the other cron endpoints (`CRON_SECRET`). No request
 * actor, so on a trapped environment the mail follows the `EMAIL_DEV_RECIPIENTS`
 * fallback: set it on non-prod, or the sends are dropped by design.
 */
export const POST: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = env.CRON_SECRET;

  if (!cronSecret || !token || !safeTokenEquals(token, cronSecret)) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  try {
    const result = await sendAdminDigest();
    console.log(
      `[Job] Admin digest: ${result.sent} sent, ${result.failed} failed ` +
        `(${result.summary.eventsToPrepare} events to prepare, ` +
        `${result.summary.unresolvedSyncErrors} sync errors).`,
    );
    return json({ success: true, ...result });
  } catch (err) {
    console.error('[Job] Admin digest failed:', err);
    throw error(500, 'Internal Server Error');
  }
};
