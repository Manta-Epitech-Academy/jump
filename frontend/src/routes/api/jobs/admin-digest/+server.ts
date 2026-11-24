import { cronJob } from '#lib/server/cronJob.ts';
import { sendAdminDigest } from '#lib/server/services/adminDigest/index.ts';

/**
 * Weekly admin digest. Expected schedule: Monday morning, Europe/Paris. As a k8s
 * CronJob (UTC): `0 6 * * 1` gives 08:00 Paris in summer, 07:00 in winter. The
 * exact hour does not matter to the content, so no DST handling is needed.
 *
 * No request actor, so on a trapped environment the mail follows the
 * `EMAIL_DEV_RECIPIENTS` fallback: set it on non-prod, or the sends are dropped
 * by design.
 *
 * With no admin chosen to receive it, nothing is built or sent and the log says
 * so: an empty Monday is a configuration state, not a failure. A second trigger
 * in a week whose digest already went out sends nothing either (the week is
 * claimed on `AdminDigest_Run`), so re-running this endpoint by hand is safe.
 */
export const POST = cronJob('Admin digest', async () => {
  const result = await sendAdminDigest();
  const line =
    result.outcome === 'sent'
      ? `[Job] Admin digest: ${result.sent} sent, ${result.failed} failed ` +
        `(${result.summary.eventsToPrepare} events to prepare, ` +
        `${result.summary.openSyncErrors} sync errors).`
      : result.outcome === 'already_sent'
        ? "[Job] Admin digest: this week's digest already reached somebody or is being sent, nothing sent."
        : '[Job] Admin digest: no recipient chosen (write_admin_digest_recipient), nothing sent.';
  console.log(line);
  return { success: true, ...result };
});
