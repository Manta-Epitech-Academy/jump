import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { setTicketsEnabled } from '$lib/server/settings/tickets';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (locals.staffProfile?.staffRole !== 'admin') throw error(403);

  const payload = await request.json();
  if (typeof payload?.enabled !== 'boolean') throw error(400);

  await setTicketsEnabled(payload.enabled);
  return json({ enabled: payload.enabled });
};
