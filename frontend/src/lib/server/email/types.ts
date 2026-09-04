/**
 * Provider-agnostic mail types. The façade in `./index.ts` exposes these
 * to every call site; concrete providers (`./providers/{resend,mailjet}.ts`)
 * translate `MailMessage` into their own SDK / API shape.
 */

export interface MailAttachment {
  filename: string;
  /** Base64-encoded content. */
  content: string;
  /** Full Content-Type header: providers forward verbatim. */
  contentType: string;
}

export interface MailMessage {
  /** RFC 5322 address, e.g. `"Jump <noreply@jump.fr>"`. */
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: MailAttachment[];
}

export type SendEmailFailure = {
  ok: false;
  /**
   * `api_error`: the provider rejected the request. Could be permanent
   * (bad address, validation) or transient (rate limit, 5xx): inspect
   * `statusCode` to decide.
   * `network_error`: the SDK / fetch threw before getting a response.
   * Always transient; a retry may succeed.
   * `dev_redirect_dropped`: the env is trapped (`OUTBOUND_MODE != real`) but no
   * dev destination resolved, so the send was suppressed rather than leaked to
   * the real recipient. Permanent: retrying won't help; configure a redirect
   * destination. The provider was never called.
   */
  reason: 'api_error' | 'network_error' | 'dev_redirect_dropped';
  message: string;
  /**
   * HTTP status from the provider when `reason === 'api_error'`. `null` /
   * `undefined` for network errors or when the upstream didn't surface one.
   * 429 and 5xx → retryable. Other 4xx → permanent.
   */
  statusCode?: number | null;
};

export type SendEmailResult = { ok: true; id: string } | SendEmailFailure;

/**
 * Per-send dev-redirect destination control. Consulted ONLY when the gate
 * (`OUTBOUND_MODE != real`) traps outbound: a no-op in prod, so it can never
 * misroute a real send. See `./dev-redirect.ts → resolveMailRouting`.
 *
 *   - omitted   → redirect to the env list (default; system / automatic sends)
 *   - string[]  → redirect to these addresses instead (e.g. the staff member
 *                 who triggered a bulk send, so copies land in their own inbox)
 *   - 'bypass'  → no redirect; reach the real recipient. Reserve for a single,
 *                 explicit, human-typed test-send: never a cohort send.
 */
export type DevRedirectControl = readonly string[] | 'bypass';

export interface SendOptions {
  devRedirect?: DevRedirectControl;
}

export interface MailProvider {
  readonly name: 'resend' | 'mailjet';
  /** Max messages per batch call. Caller chunks before sending. */
  readonly batchMax: number;
  send(payload: MailMessage): Promise<SendEmailResult>;
  sendBatch(payloads: MailMessage[]): Promise<SendEmailResult[]>;
}
