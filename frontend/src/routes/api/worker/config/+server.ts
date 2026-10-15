import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireWorkerToken } from '$lib/server/auth/workerToken';
import { getWorkerConfig } from '$lib/server/services/syncConfigService';

/**
 * The first call of every tick, and the only one on a tick with nothing due.
 *
 * Jump owns the whole decision: what to pull, whether now, in which mode, and
 * from when. The worker holds no cadence and no whitelist of its own, so
 * tightening the incremental during a stage takes effect here at the next tick
 * with nothing redeployed.
 *
 * The answer's shape is the worker's, not ours: `mode` is always a real mode
 * even when `shouldSync` is false (it is validated first, so an empty one makes
 * the run throw instead of no-op), and `since` is always present as a key,
 * `null` in `full`. `workerConfigAnswerSchema` transcribes those rules and
 * `workerConfigContract.test.ts` holds us to them.
 */
export const GET: RequestHandler = async ({ request }) => {
  requireWorkerToken(request);
  return json(await getWorkerConfig());
};
