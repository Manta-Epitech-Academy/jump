import {
  sendEmail,
  sendEmailBatch,
  MAIL_BATCH_MAX,
  MAIL_FROM,
  type SendEmailFailure,
} from '$lib/server/email';
import type { MailMessage, MailProvider, SendOutcome } from './types';

/**
 * Network errors are always transient (the transport threw before getting
 * a response). API errors are transient only on 429 (rate limit) or 5xx.
 * 4xx (validation, suppressed, invalid email) are permanent — retrying
 * won't help. When the statusCode is unknown, default to non-retryable
 * to avoid wasting API calls on inputs that will never work.
 */
function isRetryableFailure(failure: SendEmailFailure): boolean {
  if (failure.reason === 'network_error') return true;
  const code = failure.statusCode;
  if (typeof code !== 'number') return false;
  return code === 429 || (code >= 500 && code < 600);
}

function toOutcome(result: Awaited<ReturnType<typeof sendEmail>>): SendOutcome {
  if (result.ok) return { ok: true, providerMessageId: result.id };
  return {
    ok: false,
    message: `${result.reason}: ${result.message}`,
    retryable: isRetryableFailure(result),
  };
}

export const transactionalMailProvider: MailProvider = {
  async sendMail({ to, subject, html }): Promise<SendOutcome> {
    return toOutcome(await sendEmail({ from: MAIL_FROM, to, subject, html }));
  },

  async sendMailBatch(messages: MailMessage[]): Promise<SendOutcome[]> {
    if (messages.length === 0) return [];
    const outcomes: SendOutcome[] = [];
    // Active provider caps batches at MAIL_BATCH_MAX (Resend=100, Mailjet=50);
    // chunk transparently so the orchestrator's PAGE size stays provider-
    // agnostic.
    for (let i = 0; i < messages.length; i += MAIL_BATCH_MAX) {
      const chunk = messages.slice(i, i + MAIL_BATCH_MAX);
      const results = await sendEmailBatch(
        chunk.map((m) => ({
          from: MAIL_FROM,
          to: m.to,
          subject: m.subject,
          html: m.html,
        })),
      );
      for (const r of results) outcomes.push(toOutcome(r));
    }
    return outcomes;
  },
};

export function getMailProvider(): MailProvider {
  return transactionalMailProvider;
}
