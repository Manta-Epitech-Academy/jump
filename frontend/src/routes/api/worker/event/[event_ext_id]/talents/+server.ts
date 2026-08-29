import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { syncTalents } from '$lib/server/services/syncService';
import { recordSync } from '$lib/server/infra/syncStatus';
import { safeTokenEquals } from '$lib/server/auth/safeTokenCompare';
import { workerTalentsPayloadSchema } from '$lib/validation/workerSync';

export const POST: RequestHandler = async ({ request, params }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (
    !env.WORKER_API_TOKEN ||
    !token ||
    !safeTokenEquals(token, env.WORKER_API_TOKEN)
  )
    throw error(401, 'Unauthorized: Invalid or missing token');

  // Validated rather than trusted: this payload drives a prune, so a body that
  // is not the shape we expect has to be refused before the service sees it.
  const parsed = workerTalentsPayloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    throw error(400, 'Invalid payload: expected { talents: [...] }');
  }

  const result = await syncTalents(params.event_ext_id, parsed.data.talents);
  if ('error' in result) throw error(400, result.error);

  await recordSync({
    type: 'talents',
    eventExtId: params.event_ext_id,
    created: result.created,
    updated: result.updated,
    removed: result.removed,
    skipped: result.skipped,
  });
  return json(result);
};
