/**
 * Provider-agnostic SMS types, mirroring `$lib/server/email/types.ts`. The
 * façade in `./index.ts` exposes these to every call site; concrete providers
 * (`./providers/{brevo,null}.ts`) translate `SmsMessage` into their own API
 * shape.
 */

export interface SmsMessage {
  /**
   * Recipient phone number in the digits-only, country-coded form Brevo
   * expects (see `$lib/domain/phone` → `toBrevoRecipient`). The façade does
   * not normalize — callers pass an already-validated number.
   */
  to: string;
  /** Plain-text body. SMS carries no markup and no tracked links. */
  body: string;
}

export type SendSmsFailure = {
  ok: false;
  /**
   * `api_error`: the provider rejected the request — permanent (bad number,
   * unconfigured) or transient (rate limit, 5xx); inspect `statusCode`.
   * `network_error`: fetch threw before a response. Always transient.
   */
  reason: 'api_error' | 'network_error';
  message: string;
  /**
   * HTTP status when `reason === 'api_error'`. `null`/`undefined` for network
   * errors. 429 and 5xx → retryable; other 4xx → permanent.
   */
  statusCode?: number | null;
};

export type SendSmsResult = { ok: true; id: string } | SendSmsFailure;

export interface SmsProvider {
  readonly name: 'brevo' | 'null';
  send(payload: SmsMessage): Promise<SendSmsResult>;
}
