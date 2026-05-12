/**
 * Single entry point for sending mail through Resend.
 *
 * The Resend SDK does **not** throw on 4xx/5xx responses — `emails.send`
 * resolves with `{ data: null, error }`. Treating the awaited promise as
 * "delivered" therefore lets bounces, rate limits, suppressed recipients,
 * and validation errors slip through silently. That has two concrete
 * failure modes in this codebase:
 *
 *   - The email-mode calendar sync writes `contentHash` after a "success",
 *     so the next reconcile dedupes the retry — the recipient never sees
 *     an invite and the only recovery is the manual `forceResync` action.
 *   - The relance service writes an `OnboardingReminder` audit row and
 *     increments the "sent" toast, so staff thinks the relance went out
 *     when it didn't.
 *
 * `sendEmail` collapses both the SDK's discriminated-union return and
 * network throws into a single `SendEmailResult`, forcing callers to
 * branch before they commit any "delivered" side-effect.
 */

import { Resend, type CreateEmailOptions } from 'resend';
import { env } from '$env/dynamic/private';

let client: Resend | null = null;
function getClient(): Resend {
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

/**
 * Dev-only override: when `EMAIL_DEV_RECIPIENTS` (comma-separated) is set,
 * every outbound email is rerouted to those addresses instead of the
 * intended recipients. `cc`/`bcc` are dropped, and the subject is prefixed
 * with the original `to` so the developer can tell who would have received
 * it in prod. Unset (or empty) = production behaviour, mail goes to the
 * real recipients. Treat any non-empty value as "this is not prod".
 */
function parseDevRecipients(): string[] | null {
  const raw = env.EMAIL_DEV_RECIPIENTS?.trim();
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

function applyDevRedirect(
  payload: CreateEmailOptions,
  devRecipients: string[],
): CreateEmailOptions {
  const originalTo = Array.isArray(payload.to)
    ? payload.to.join(', ')
    : (payload.to ?? '');
  return {
    ...payload,
    to: devRecipients,
    cc: undefined,
    bcc: undefined,
    subject: originalTo
      ? `[→ ${originalTo}] ${payload.subject ?? ''}`
      : (payload.subject ?? ''),
  };
}

export type SendEmailFailure = {
  ok: false;
  /**
   * `api_error`: Resend rejected the request. Could be permanent (bad
   * address, validation) or transient (rate limit, 5xx) — inspect
   * `statusCode` to decide.
   * `network_error`: the SDK threw before getting a response. Always
   * transient; a retry may succeed.
   */
  reason: 'api_error' | 'network_error';
  message: string;
  /**
   * HTTP status from Resend when `reason === 'api_error'`. `null` /
   * `undefined` for network errors or when the SDK didn't surface one.
   * 429 and 5xx → retryable. 4xx (other) → permanent.
   */
  statusCode?: number | null;
};

export type SendEmailResult = { ok: true; id: string } | SendEmailFailure;

export async function sendEmail(
  payload: CreateEmailOptions,
): Promise<SendEmailResult> {
  try {
    const devRecipients = parseDevRecipients();
    const finalPayload = devRecipients
      ? applyDevRedirect(payload, devRecipients)
      : payload;
    const { data, error } = await getClient().emails.send(finalPayload);
    if (error) {
      return {
        ok: false,
        reason: 'api_error',
        message: error.message,
        statusCode: error.statusCode ?? null,
      };
    }
    if (!data?.id) {
      // The SDK contract says one of `data` / `error` is set, never both
      // null, but we narrow defensively rather than `!` the id.
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

/** Resend's batch endpoint caps at 100 emails per request. */
export const RESEND_BATCH_MAX = 100;

/**
 * Batch-send up to `RESEND_BATCH_MAX` emails in a single API call.
 *
 * Returns an array of per-payload results aligned to the input index — the
 * orchestrator uses this to update each `BroadcastRecipient` row with its
 * own status / message id / error message.
 *
 * Permissive validation: one bad email won't tank the whole batch.
 * Successful entries come back in input-order in `data`, and `errors` lists
 * the failed indices — we splice them back together so caller doesn't need
 * to know the SDK shape.
 *
 * Attachments and `scheduledAt` are not supported by the batch endpoint —
 * callers that need either must use `sendEmail` per message.
 */
export async function sendEmailBatch(
  payloads: CreateEmailOptions[],
): Promise<SendEmailResult[]> {
  if (payloads.length === 0) return [];
  if (payloads.length > RESEND_BATCH_MAX) {
    throw new Error(
      `sendEmailBatch: ${payloads.length} > Resend batch cap of ${RESEND_BATCH_MAX}`,
    );
  }

  const devRecipients = parseDevRecipients();
  const finalPayloads = devRecipients
    ? payloads.map((p) => applyDevRedirect(p, devRecipients))
    : payloads;

  try {
    const { data, error } = await getClient().batch.send(finalPayloads, {
      batchValidation: 'permissive',
    });
    if (error) {
      return finalPayloads.map(() => ({
        ok: false as const,
        reason: 'api_error' as const,
        message: error.message,
        statusCode: error.statusCode ?? null,
      }));
    }
    if (!data) {
      return finalPayloads.map(() => ({
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
    return finalPayloads.map((_, i): SendEmailResult => {
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
    return finalPayloads.map(() => ({
      ok: false as const,
      reason: 'network_error' as const,
      message: err instanceof Error ? err.message : String(err),
    }));
  }
}

/**
 * Throw-on-failure variant for call sites whose contract is "this email
 * must go out or the calling action fails" (OTP delivery, parent welcome
 * from the onboarding flow). Keeps the per-callsite ergonomics of the
 * old `await emails.send(...)` form while restoring the failure signal.
 */
export async function sendEmailOrThrow(
  payload: CreateEmailOptions,
): Promise<string> {
  const result = await sendEmail(payload);
  if (!result.ok) {
    throw new Error(`Resend ${result.reason}: ${result.message}`);
  }
  return result.id;
}
