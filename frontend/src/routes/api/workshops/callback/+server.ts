import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { verifyCallbackSignature } from '$lib/server/hmac';
import { workshopKeys } from '$lib/server/workshops/ticket';
import {
  applyWorkshopProgress,
  type WorkshopCallbackPayload,
} from '$lib/server/services/workshopService';

/**
 * What a CTFd instance reports after a talent validates a step.
 *
 * `/api/*` is public to `guards.ts`, so the route authenticates itself: the body
 * is read as TEXT before anything parses it, because the signature covers the
 * bytes on the wire and re-serialising JSON would sign something else. The
 * freshness window is `verifyCallbackSignature`'s own five minutes, which is what
 * makes a captured body un-replayable later.
 *
 * `X-Idempotency-Key` is read for the logs only: the write is idempotent by
 * construction (one grant per talent and instance, upserted), so a resend whose
 * response was lost costs nothing.
 */
export const POST: RequestHandler = async ({ request }) => {
  const secret = env.WORKSHOP_TICKET_SECRET;
  if (!secret) {
    console.error(
      '[workshops/callback] WORKSHOP_TICKET_SECRET not configured.',
    );
    throw error(500, 'misconfigured');
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get('x-timestamp') ?? '';
  const signature = request.headers.get('x-signature') ?? '';

  const { callbackKey } = workshopKeys(secret);
  if (!verifyCallbackSignature(rawBody, timestamp, signature, callbackKey)) {
    throw error(401, 'bad signature');
  }

  let payload: WorkshopCallbackPayload;
  try {
    payload = JSON.parse(rawBody) as WorkshopCallbackPayload;
  } catch {
    throw error(400, 'invalid json');
  }

  if (
    typeof payload.instanceSlug !== 'string' ||
    typeof payload.talentId !== 'string' ||
    !Number.isInteger(payload.solvedSteps) ||
    !Number.isInteger(payload.totalSteps) ||
    payload.solvedSteps < 0 ||
    payload.totalSteps < 0 ||
    typeof payload.isComplete !== 'boolean'
  ) {
    throw error(400, 'invalid payload shape');
  }

  try {
    await applyWorkshopProgress(payload);
  } catch (err) {
    console.error('[workshops/callback] applyWorkshopProgress failed:', err);
    throw error(500, 'persist failed');
  }

  return json({ ok: true });
};
