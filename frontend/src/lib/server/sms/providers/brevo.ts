/**
 * Brevo (ex-Sendinblue) transactional SMS provider. REST via fetch, no SDK:
 * the surface is one endpoint.
 *
 *   POST https://api.brevo.com/v3/transactionalSMS/sms
 *   headers: api-key, content-type/accept: application/json
 *   body:    { sender, recipient, content, type: 'transactional', tag }
 *
 * A 2xx returns `{ reference, messageId, … }`; everything else returns
 * `{ code, message }`. We collapse both (plus network throws) into a single
 * `SendSmsResult` so callers branch once before committing any "sent"
 * side-effect (matches the email provider contract).
 */

import { env } from '$env/dynamic/private';
import { SMS_SENDER } from '../config';
import type { SmsMessage, SmsProvider, SendSmsResult } from '../types';

const BREVO_SMS_ENDPOINT = 'https://api.brevo.com/v3/transactionalSMS/sms';

async function send({ to, body }: SmsMessage): Promise<SendSmsResult> {
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: 'api_error',
      message: 'BREVO_API_KEY is not set',
      statusCode: null,
    };
  }

  let res: Response;
  try {
    res = await fetch(BREVO_SMS_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: SMS_SENDER,
        recipient: to,
        content: body,
        type: 'transactional',
        tag: 'jump-relance',
      }),
    });
  } catch (err) {
    return {
      ok: false,
      reason: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  if (!res.ok) {
    // Brevo error payloads are `{ code, message }`; fall back to the status
    // text if the body isn't JSON (gateway errors sometimes return HTML).
    let message = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as { code?: string; message?: string };
      if (errBody?.message) message = errBody.message;
    } catch {
      /* keep the status-derived message */
    }
    return { ok: false, reason: 'api_error', message, statusCode: res.status };
  }

  const data = (await res.json().catch(() => null)) as {
    messageId?: number | string;
    reference?: string;
  } | null;
  const id =
    data?.messageId != null ? String(data.messageId) : (data?.reference ?? '');
  if (!id) {
    return {
      ok: false,
      reason: 'api_error',
      message: 'Brevo returned no messageId',
      statusCode: res.status,
    };
  }
  return { ok: true, id };
}

export const brevoSmsProvider: SmsProvider = {
  name: 'brevo',
  send,
};
