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

export type SendEmailFailure = {
  ok: false;
  /**
   * `api_error`: Resend rejected the request (bad address, rate limit,
   * suppression, validation). Retrying without changing the payload won't
   * help — fix the input or wait out the throttle.
   * `network_error`: the SDK threw before getting a response. Transient;
   * a retry may succeed.
   */
  reason: 'api_error' | 'network_error';
  message: string;
};

export type SendEmailResult = { ok: true; id: string } | SendEmailFailure;

export async function sendEmail(
  payload: CreateEmailOptions,
): Promise<SendEmailResult> {
  try {
    const { data, error } = await getClient().emails.send(payload);
    if (error) {
      return { ok: false, reason: 'api_error', message: error.message };
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
