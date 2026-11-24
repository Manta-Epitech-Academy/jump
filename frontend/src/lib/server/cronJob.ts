import { error, type RequestHandler } from '@sveltejs/kit';
import { CRON_SECRET } from '$app/env/private';
import { requireBearerSecret } from '#lib/server/auth/bearerSecret.ts';

/**
 * Every `/api/jobs/*` route is `export const POST = cronJob(name, run)`.
 *
 * The external cron service calls them with `Authorization: Bearer
 * $CRON_SECRET`, and that check (`requireBearerSecret`) runs here before `run`,
 * so a job route cannot exist without it: `jobs.gate.test.ts` calls every
 * exported handler under `src/routes/api/jobs/` without the secret and fails
 * on anything but a 401. A job writes the database (anonymisation, purges,
 * broadcast sends), so a route that skipped the check would open those writes
 * to anybody who finds the path.
 *
 * `run` returns the JSON the scheduler reads. A throw is logged under the job's
 * name and answers a bare 500: the scheduler retries on its own cadence and the
 * pod log is where an operator reads why.
 */
export function cronJob(
  name: string,
  run: () => Promise<Record<string, unknown>>,
): RequestHandler {
  return async ({ request }) => {
    requireBearerSecret(request, CRON_SECRET);
    try {
      return Response.json(await run());
    } catch (err) {
      console.error(`[Job] ${name} failed:`, err);
      throw error(500, 'Internal Server Error');
    }
  };
}
