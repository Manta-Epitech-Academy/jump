import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireWorkerToken } from '$lib/server/auth/workerToken';
import { workerParticipationsPayloadSchema } from '$lib/validation/workerSync';
import { syncParticipations } from '$lib/server/services/syncService';

/**
 * One event's enrolments, as `external_id` to raw Salesforce status.
 *
 * `mode` is required and is what authorises the prune. A `full` pass carries
 * every member of the campaign, so an enrolment absent from it is gone; an
 * `incremental` one carries only what Salesforce reports as touched, and a
 * deletion moves no modstamp, so absence proves nothing. Jump cannot tell the
 * two apart from the roster, and inferring it from whichever run is open would
 * be shared mutable state across pods, so the worker states it per call.
 *
 * Statuses are stored raw (normalised to upper case, nothing dropped): the dev
 * workspace filters them at display time, which is what lets a past event show
 * who was expected and did not come.
 */
export const POST: RequestHandler = async ({ request, params }) => {
  requireWorkerToken(request);

  const parsed = workerParticipationsPayloadSchema.safeParse(
    await request.json(),
  );
  if (!parsed.success)
    throw error(400, 'Invalid payload: expected { participations, mode }');

  const result = await syncParticipations(
    params.event_ext_id,
    parsed.data.participations,
    parsed.data.mode,
  );
  if ('error' in result) throw error(400, result.error);

  return json(result);
};
