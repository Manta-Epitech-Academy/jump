import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireWorkerToken } from '$lib/server/auth/workerToken';
import { workerRunCloseSchema } from '$lib/validation/workerSync';
import { closeRun } from '$lib/server/services/syncRunService';

/**
 * Close a run, `ok` with its counters or `error` with what went wrong.
 *
 * This is where the watermark moves, and only on `ok`: a failed run leaves the
 * previous mark standing, so the next tick asks for the same window again
 * rather than stepping over it. Nothing else in the system has to remember that
 * a run failed.
 *
 * Closing an already-closed run is refused. The worker fires a second PATCH for
 * the same id when its success PATCH is itself what failed, and letting that
 * rewrite an `ok` run as `error` would walk the watermark backwards over data
 * that did land.
 */
export const PATCH: RequestHandler = async ({ request, params }) => {
  requireWorkerToken(request);

  const parsed = workerRunCloseSchema.safeParse(await request.json());
  if (!parsed.success)
    throw error(
      400,
      'Invalid payload: expected { status: "ok", counters } or { status: "error", error }',
    );

  const result = await closeRun(params.id, parsed.data);
  if (!result.ok)
    throw error(
      result.reason === 'not_found' ? 404 : 409,
      result.reason === 'not_found' ? 'Run not found' : 'Run already closed',
    );

  return json({ ok: true });
};
