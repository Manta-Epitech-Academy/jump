import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireWorkerToken } from '$lib/server/auth/workerToken';
import { workerTalentsPayloadSchema } from '$lib/validation/workerSync';
import { syncTalents } from '$lib/server/services/syncService';

/**
 * Talent identities for the whole run, deduplicated by the worker and paginated
 * by 50, so a talent attending two events is reconciled once.
 *
 * Identities only. The enrolment and its Salesforce status travel with the
 * participations call, which is the split the domain already had: `Talent`
 * carries no campus, `Participation` does.
 *
 * Validated rather than trusted: this payload drives the reconciliation that
 * decides what Jump believes about a person, so a body that is not the shape we
 * expect is refused before the service sees it.
 *
 * The ENVELOPE is what is refused, never a row. A contact Salesforce sent with
 * no name is ordinary data, so it comes back counted in `invalid` and logged as
 * a `SyncError` for an admin, and the rest of the page is still reconciled. A
 * 400 here closes the run in error and the watermark does not move, so refusing
 * the batch over one row means replaying it, identically, at every tick.
 */
export const POST: RequestHandler = async ({ request }) => {
  requireWorkerToken(request);

  const parsed = workerTalentsPayloadSchema.safeParse(await request.json());
  if (!parsed.success)
    throw error(400, 'Invalid payload: expected { talents: [...] }');

  return json(await syncTalents(parsed.data.talents));
};
