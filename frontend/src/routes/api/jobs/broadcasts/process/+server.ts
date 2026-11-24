import { cronJob } from '#lib/server/cronJob.ts';
import { processNextQueuedBroadcast } from '#lib/server/services/broadcast/orchestrator.ts';

/**
 * Drains the broadcast queue: processes one queued broadcast per call.
 *
 * Designed to be polled by an external scheduler (cron, Vercel Cron, etc.).
 * Returns `{ processed: false }` when the queue is empty so the scheduler
 * can decide whether to keep polling or back off.
 */
export const POST = cronJob('Broadcast processing', async () => {
  const broadcastId = await processNextQueuedBroadcast();
  if (!broadcastId) return { processed: false };
  return { processed: true, broadcastId };
});
