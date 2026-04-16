import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { syncEvents } from '$lib/server/services/syncService';
import { recordSync } from '$lib/server/infra/syncStatus';

export const POST: RequestHandler = async ({ request, params }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!env.WORKER_API_TOKEN || token !== env.WORKER_API_TOKEN)
    throw error(401, 'Unauthorized: Invalid or missing token');

  const body = await request.json();
  if (!Array.isArray(body.events))
    throw error(400, 'Missing or invalid "events" array');

  const result = await syncEvents(params.campus_ext_name, body.events);
  if ('error' in result) throw error(400, result.error);

  recordSync({
    type: 'events',
    campusExtName: params.campus_ext_name,
    created: result.created,
    updated: result.updated,
  });
  return json(result);
};
