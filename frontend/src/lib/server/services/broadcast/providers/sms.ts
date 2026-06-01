import { sendSms, type SendSmsFailure } from '$lib/server/sms';
import { toBrevoRecipient } from '$lib/domain/phone';
import type { SmsProvider, SendOutcome } from './types';

/**
 * Adapts the provider-agnostic SMS façade (`$lib/server/sms`) into the
 * broadcast orchestrator's `SmsProvider`/`SendOutcome` contract — the SMS
 * twin of `./mail.ts`. Transport, dev-redirect and Brevo wiring all live in
 * the façade; this file only translates the result shape and retry semantics.
 */

/**
 * Network errors are always transient (transport threw before a response).
 * API errors are transient only on 429 (rate limit) or 5xx; other 4xx
 * (bad number, unconfigured, insufficient credits) are permanent. Unknown
 * status → non-retryable, to avoid burning SMS credits on hopeless inputs.
 */
function isRetryableFailure(failure: SendSmsFailure): boolean {
  if (failure.reason === 'network_error') return true;
  const code = failure.statusCode;
  if (typeof code !== 'number') return false;
  return code === 429 || (code >= 500 && code < 600);
}

export const transactionalSmsProvider: SmsProvider = {
  async sendSms({ to, body }, opts): Promise<SendOutcome> {
    // Recipients carry the raw, French-entered phone; the façade expects an
    // already-normalized number. An unparseable value can never succeed —
    // fail it permanently rather than handing Brevo a number it rejects.
    const recipient = toBrevoRecipient(to);
    if (!recipient) {
      return { ok: false, message: 'invalid phone number', retryable: false };
    }
    const result = await sendSms(
      { to: recipient, body },
      { devRedirect: opts?.devRedirectTo },
    );
    if (result.ok) return { ok: true, providerMessageId: result.id };
    return {
      ok: false,
      message: `${result.reason}: ${result.message}`,
      retryable: isRetryableFailure(result),
    };
  },
};

export function getSmsProvider(): SmsProvider {
  return transactionalSmsProvider;
}
