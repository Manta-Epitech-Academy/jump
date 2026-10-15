import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireWorkerToken } from '$lib/server/auth/workerToken';
import { workerRunOpenSchema } from '$lib/validation/workerSync';
import { openRun } from '$lib/server/services/syncRunService';

/**
 * Open a run report, before the worker pulls anything.
 *
 * Only a real run reaches here: a tick with nothing due exits on
 * `GET /api/worker/config` without opening one, which is what keeps this table
 * a ledger of syncs performed rather than a log of times the CronJob fired.
 *
 * The id has to sit at the top level of the answer. The worker destructures it
 * without validating, so wrapping it would produce a close call addressed to
 * `/api/worker/runs/undefined` and a run left open forever.
 */
export const POST: RequestHandler = async ({ request }) => {
  requireWorkerToken(request);

  const parsed = workerRunOpenSchema.safeParse(await request.json());
  if (!parsed.success) throw error(400, 'Invalid payload: expected { mode }');

  return json(await openRun(parsed.data.mode));
};
