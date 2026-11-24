/**
 * Provider-agnostic SMS types, mirroring `#lib/server/email/types.ts`. The
 * façade in `./index.ts` exposes these to every call site; concrete providers
 * (`./providers/{brevo,null}.ts`) translate `SmsMessage` into their own API
 * shape.
 */

export interface SmsMessage {
  /**
   * Recipient phone number in the digits-only, country-coded form Brevo
   * expects (see `#lib/domain/phone` → `toBrevoRecipient`). The façade does
   * not normalize: callers pass an already-validated number.
   */
  to: string;
  /** Plain-text body. SMS carries no markup and no tracked links. */
  body: string;
}

export type SendSmsFailure = {
  ok: false;
  /**
   * `api_error`: the provider rejected the request, permanent (bad number,
   * unconfigured) or transient (rate limit, 5xx); inspect `statusCode`.
   * `network_error`: fetch threw before a response. Always transient.
   * `dev_redirect_dropped`: the env is trapped (`OUTBOUND_MODE != real`) but no
   * dev destination resolved, so the SMS was suppressed rather than texted to a
   * real number. Permanent; the provider was never called.
   */
  reason: 'api_error' | 'network_error' | 'dev_redirect_dropped';
  message: string;
  /**
   * HTTP status when `reason === 'api_error'`. `null`/`undefined` for network
   * errors. 429 and 5xx → retryable; other 4xx → permanent.
   */
  statusCode?: number | null;
};

export type SendSmsResult = { ok: true; id: string } | SendSmsFailure;

// One definition for both channels: the trap they share decides with it.
export type { DevRedirectControl, SendOptions } from '#lib/server/outbound.ts';

export interface SmsProvider {
  readonly name: 'brevo' | 'null';
  send(payload: SmsMessage): Promise<SendSmsResult>;
}
