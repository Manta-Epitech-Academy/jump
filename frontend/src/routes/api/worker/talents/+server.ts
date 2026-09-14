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
 */
export const POST: RequestHandler = async ({ request }) => {
  requireWorkerToken(request);

  const parsed = workerTalentsPayloadSchema.safeParse(await request.json());
  if (!parsed.success)
    throw error(400, 'Invalid payload: expected { talents: [...] }');

  const result = await syncTalents(parsed.data.talents);
  if ('error' in result) throw error(400, result.error);

  return json(result);
};
