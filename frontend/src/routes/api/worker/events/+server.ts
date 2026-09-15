import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireWorkerToken } from '$lib/server/auth/workerToken';
import { workerEventsPayloadSchema } from '$lib/validation/workerSync';
import { syncEvents } from '$lib/server/services/syncService';

/**
 * The whole event list of a run, in one call, with the campus on each event.
 *
 * A campaign's children can sit on different campuses, so the campus belongs on
 * the row rather than in the path. An empty array is an ordinary answer: an
 * incremental tick where Salesforce touched nothing posts `{"events": []}`.
 *
 * Nothing here deletes, and nothing here touches `Event.devActivatedAt`: an
 * event discovered under a whitelisted parent campaign lands hidden until an
 * admin activates it, so automatic discovery never becomes automatic
 * publication in the dev workspace.
 */
export const POST: RequestHandler = async ({ request }) => {
  requireWorkerToken(request);

  const parsed = workerEventsPayloadSchema.safeParse(await request.json());
  if (!parsed.success)
    throw error(400, 'Invalid payload: expected { events: [...] }');

  return json(await syncEvents(parsed.data.events));
};
