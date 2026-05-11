import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { processNextQueuedBroadcast } from '$lib/server/services/broadcast/orchestrator';

/**
 * Drains the broadcast queue: processes one queued broadcast per call.
 *
 * Designed to be polled by an external scheduler (cron, Vercel Cron, etc.).
 * Returns `{ processed: false }` when the queue is empty so the scheduler
 * can decide whether to keep polling or back off.
 */
export const POST: RequestHandler = async ({ request }) => {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const cronSecret = env.CRON_SECRET;

  if (!cronSecret || token !== cronSecret) {
    throw error(401, 'Unauthorized: Invalid or missing token');
  }

  try {
    const broadcastId = await processNextQueuedBroadcast();
    if (!broadcastId) return json({ processed: false });
    return json({ processed: true, broadcastId });
  } catch (err) {
    console.error('[job] broadcast processing failed', err);
    throw error(500, 'Internal Server Error');
  }
};
