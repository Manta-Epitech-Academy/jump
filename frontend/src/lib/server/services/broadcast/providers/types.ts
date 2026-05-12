export type SendOutcome =
  | { ok: true; providerMessageId?: string }
  | {
      ok: false;
      message: string;
      /**
       * Whether the failure looks transient (network error, 429, 5xx).
       * Orchestrator uses this to decide between "retry later" and
       * "give up permanently". Default `false` — caller must opt-in by
       * proving the failure is recoverable.
       */
      retryable: boolean;
    };

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface MailProvider {
  sendMail(args: MailMessage): Promise<SendOutcome>;
  /**
   * Send a batch in a single API call when the provider supports it.
   * Returns one outcome per input message, aligned by index. Implementations
   * may chunk internally if the upstream provider has a per-call cap.
   */
  sendMailBatch(messages: MailMessage[]): Promise<SendOutcome[]>;
}

export interface SmsProvider {
  sendSms(args: { to: string; body: string }): Promise<SendOutcome>;
}
