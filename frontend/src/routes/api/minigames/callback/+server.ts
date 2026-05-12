import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { verifyCallbackSignature } from '$lib/server/hmac';
import {
  applyCallback,
  type CallbackPayload,
} from '$lib/server/services/minigameService';

export const POST: RequestHandler = async ({ request }) => {
  const secret = env.JUMP_GAMES_SECRET;
  if (!secret) {
    console.error('[minigames/callback] JUMP_GAMES_SECRET not configured.');
    throw error(500, 'misconfigured');
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get('x-timestamp') ?? '';
  const signature = request.headers.get('x-signature') ?? '';

  if (!verifyCallbackSignature(rawBody, timestamp, signature, secret)) {
    throw error(401, 'bad signature');
  }

  let payload: CallbackPayload;
  try {
    payload = JSON.parse(rawBody) as CallbackPayload;
  } catch {
    throw error(400, 'invalid json');
  }

  if (
    typeof payload.playerId !== 'string' ||
    typeof payload.game !== 'string' ||
    typeof payload.level !== 'number' ||
    typeof payload.chrono !== 'number' ||
    typeof payload.valid !== 'boolean'
  ) {
    throw error(400, 'invalid payload shape');
  }

  try {
    await applyCallback(payload);
  } catch (err) {
    console.error('[minigames/callback] applyCallback failed:', err);
    throw error(500, 'persist failed');
  }

  return json({ ok: true });
};
