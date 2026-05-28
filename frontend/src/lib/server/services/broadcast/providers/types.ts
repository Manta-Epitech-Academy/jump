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

/**
 * Steers the dev-redirect destination for a bulk send. Honoured only when the
 * env trap is active (dev/staging) — a no-op in prod. A broadcast passes its
 * creator's address so trapped copies land in the inbox of the staff member
 * who triggered it, rather than the shared `*_DEV_RECIPIENTS` list: each
 * tester sees only their own sends, and can verify real rendering without
 * touching a real recipient. Omitted → the env list (the catch-all when no
 * human is behind the send).
 */
export interface BroadcastSendOptions {
  devRedirectTo?: readonly string[];
}

export interface MailProvider {
  sendMail(
    args: MailMessage,
    opts?: BroadcastSendOptions,
  ): Promise<SendOutcome>;
  /**
   * Send a batch in a single API call when the provider supports it.
   * Returns one outcome per input message, aligned by index. Implementations
   * may chunk internally if the upstream provider has a per-call cap.
   */
  sendMailBatch(
    messages: MailMessage[],
    opts?: BroadcastSendOptions,
  ): Promise<SendOutcome[]>;
}

export interface SmsProvider {
  sendSms(
    args: { to: string; body: string },
    opts?: BroadcastSendOptions,
  ): Promise<SendOutcome>;
}
