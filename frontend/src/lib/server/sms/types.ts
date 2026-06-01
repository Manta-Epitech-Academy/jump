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

/**
 * Per-send dev-redirect destination control, mirroring the mail façade
 * (`$lib/server/email/types.ts → DevRedirectControl`). Consulted ONLY when the
 * gate (`OUTBOUND_MODE != real`) traps outbound — a no-op in prod.
 *
 *   - omitted   → redirect to the env list (default; system / automatic sends)
 *   - string[]  → redirect to these numbers instead
 *   - 'bypass'  → no redirect; reach the real recipient. Single, explicit,
 *                 human-typed test-send only — never a cohort send.
 */
export type DevRedirectControl = readonly string[] | 'bypass';

export interface SendOptions {
  devRedirect?: DevRedirectControl;
}

export interface SmsProvider {
  readonly name: 'brevo' | 'null';
  send(payload: SmsMessage): Promise<SendSmsResult>;
}
