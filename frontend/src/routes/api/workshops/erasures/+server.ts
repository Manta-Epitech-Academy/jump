import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { verifyCallbackSignature } from '$lib/server/hmac';
import { workshopKeys } from '$lib/server/workshops/ticket';
import {
  erasedTalentIds,
  WORKSHOP_ERASURE_BATCH_MAX,
} from '$lib/server/services/workshopService';

/**
 * A CTFd instance asking which of its accounts belong to talents Jump has
 * erased, so it can delete them.
 *
 * A pull, and on purpose. Jump erases a talent from two places (the inactivity
 * sweep and a fulfilled deletion request) and holds no outbox, so a call from
 * either of them would be lost whenever an instance is down, and an instance
 * stays up from a few weeks to indefinitely (a flagship subject is never taken
 * down). Asked from the instance side, the answer is read off
 * `Talent.anonymizedAt` every time, so it is as true on the hundredth question
 * as on the first, and an instance that was off for a month catches up on its
 * next one.
 *
 * Authenticated exactly like the progress callback, the other request CTFd
 * makes: the same derived key, the same two headers, the signature over the
 * bytes on the wire and `verifyCallbackSignature`'s five-minute window. The ids
 * are cuids the instance already holds and the answer is a subset of them, so a
 * signed caller learns nothing it could not already name.
 */
export const POST: RequestHandler = async ({ request }) => {
  const secret = env.WORKSHOP_TICKET_SECRET;
  if (!secret) {
    console.error(
      '[workshops/erasures] WORKSHOP_TICKET_SECRET not configured.',
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

  let payload: { talentIds?: unknown };
  try {
    payload = JSON.parse(rawBody) as { talentIds?: unknown };
  } catch {
    throw error(400, 'invalid json');
  }

  const { talentIds } = payload;
  if (
    !Array.isArray(talentIds) ||
    talentIds.length > WORKSHOP_ERASURE_BATCH_MAX ||
    !talentIds.every((id) => typeof id === 'string' && id.length > 0)
  ) {
    throw error(400, 'invalid payload shape');
  }

  return json({ erased: await erasedTalentIds(talentIds as string[]) });
};
