/**
 * Provider-agnostic mail types. The façade in `./index.ts` exposes these
 * to every call site; concrete providers (`./providers/{resend,mailjet}.ts`)
 * translate `MailMessage` into their own SDK / API shape.
 */

export interface MailAttachment {
  filename: string;
  /** Base64-encoded content. */
  content: string;
  /** Full Content-Type header — providers forward verbatim. */
  contentType: string;
}

export interface MailMessage {
  /** RFC 5322 address — e.g. `"Jump <noreply@jump.fr>"`. */
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
   * (bad address, validation) or transient (rate limit, 5xx) — inspect
   * `statusCode` to decide.
   * `network_error`: the SDK / fetch threw before getting a response.
   * Always transient; a retry may succeed.
   */
  reason: 'api_error' | 'network_error';
  message: string;
  /**
   * HTTP status from the provider when `reason === 'api_error'`. `null` /
   * `undefined` for network errors or when the upstream didn't surface one.
   * 429 and 5xx → retryable. Other 4xx → permanent.
   */
  statusCode?: number | null;
};

export type SendEmailResult = { ok: true; id: string } | SendEmailFailure;

export interface MailProvider {
  readonly name: 'resend' | 'mailjet';
  /** Max messages per batch call. Caller chunks before sending. */
  readonly batchMax: number;
  send(payload: MailMessage): Promise<SendEmailResult>;
  sendBatch(payloads: MailMessage[]): Promise<SendEmailResult[]>;
}
