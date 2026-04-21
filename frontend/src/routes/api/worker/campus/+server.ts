import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { listCampuses } from '$lib/server/services/syncService';
import { recordSync } from '$lib/server/infra/syncStatus';

export const GET: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!env.WORKER_API_TOKEN || token !== env.WORKER_API_TOKEN)
    throw error(401, 'Unauthorized: Invalid or missing token');

  const campuses = await listCampuses();
  await recordSync({ type: 'campus_list' });
  return json(campuses);
};
