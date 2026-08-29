/**
 * Resend provider. Uses the official `resend` SDK.
 *
 * The SDK does **not** throw on 4xx/5xx responses: `emails.send` resolves
 * with `{ data: null, error }`. Treating the awaited promise as "delivered"
 * therefore lets bounces, rate limits, suppressed recipients, and validation
 * errors slip through silently. We collapse the discriminated-union return
 * and network throws into a single `SendEmailResult`, forcing callers to
 * branch before they commit any "delivered" side-effect.
 */

import { Resend, type CreateEmailOptions } from 'resend';
import { env } from '$env/dynamic/private';
import type { MailMessage, MailProvider, SendEmailResult } from '../types';

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

/** Resend's batch endpoint caps at 100 emails per request. */
const RESEND_BATCH_MAX = 100;

function toResendPayload(msg: MailMessage): CreateEmailOptions {
  return {
    from: msg.from,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    attachments: msg.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  } as CreateEmailOptions;
}

async function send(msg: MailMessage): Promise<SendEmailResult> {
  try {
    const { data, error } = await getClient().emails.send(toResendPayload(msg));
    if (error) {
      return {
        ok: false,
        reason: 'api_error',
        message: error.message,
        statusCode: error.statusCode ?? null,
      };
    }
    if (!data?.id) {
      return {
        ok: false,
        reason: 'api_error',
        message: 'Resend returned no email id',
      };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    return {
      ok: false,
      reason: 'network_error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Batch send. Permissive validation: one bad email won't tank the whole
 * batch. Successful entries come back in input-order in `data`, and `errors`
 * lists the failed indices: we splice them back together so the caller
 * doesn't need to know the SDK shape.
 *
 * Attachments and `scheduledAt` are not supported by Resend's batch endpoint:
 * callers that need either must use `send` per message.
 */
async function sendBatch(payloads: MailMessage[]): Promise<SendEmailResult[]> {
  if (payloads.length === 0) return [];
  const sdkPayloads = payloads.map(toResendPayload);
  try {
    const { data, error } = await getClient().batch.send(sdkPayloads, {
      batchValidation: 'permissive',
    });
    if (error) {
      return sdkPayloads.map(() => ({
        ok: false as const,
        reason: 'api_error' as const,
        message: error.message,
        statusCode: error.statusCode ?? null,
      }));
    }
    if (!data) {
      return sdkPayloads.map(() => ({
        ok: false as const,
        reason: 'api_error' as const,
        message: 'Resend returned no batch data',
      }));
    }

    const ids: { id: string }[] = Array.isArray(data.data) ? data.data : [];
    const errorByIndex = new Map<number, string>();
    const errs = (data as { errors?: { index: number; message: string }[] })
      .errors;
    if (Array.isArray(errs)) {
      for (const e of errs) errorByIndex.set(e.index, e.message);
    }

    let cursor = 0;
    return sdkPayloads.map((_, i): SendEmailResult => {
      const errMsg = errorByIndex.get(i);
      if (errMsg) {
        return { ok: false, reason: 'api_error', message: errMsg };
      }
      const entry = ids[cursor++];
      if (!entry?.id) {
        return {
          ok: false,
          reason: 'api_error',
          message: 'missing id in batch response',
        };
      }
      return { ok: true, id: entry.id };
    });
  } catch (err) {
    return sdkPayloads.map(() => ({
      ok: false as const,
      reason: 'network_error' as const,
      message: err instanceof Error ? err.message : String(err),
    }));
  }
}

export const resendProvider: MailProvider = {
  name: 'resend',
  batchMax: RESEND_BATCH_MAX,
  send,
  sendBatch,
};
