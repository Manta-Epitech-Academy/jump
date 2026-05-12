import { env } from '$env/dynamic/private';
import {
  sendEmail,
  sendEmailBatch,
  RESEND_BATCH_MAX,
  type SendEmailFailure,
} from '$lib/server/email/resend';
import type { MailMessage, MailProvider, SendOutcome } from './types';

const FROM_EMAIL = env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>';

/**
 * Network errors are always transient (the SDK threw before getting a
 * response). API errors are transient only on 429 (rate limit) or 5xx.
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

export const resendMailProvider: MailProvider = {
  async sendMail({ to, subject, html }): Promise<SendOutcome> {
    return toOutcome(await sendEmail({ from: FROM_EMAIL, to, subject, html }));
  },

  async sendMailBatch(messages: MailMessage[]): Promise<SendOutcome[]> {
    if (messages.length === 0) return [];
    const outcomes: SendOutcome[] = [];
    // Resend caps batches at RESEND_BATCH_MAX; chunk transparently.
    for (let i = 0; i < messages.length; i += RESEND_BATCH_MAX) {
      const chunk = messages.slice(i, i + RESEND_BATCH_MAX);
      const results = await sendEmailBatch(
        chunk.map((m) => ({
          from: FROM_EMAIL,
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
  return resendMailProvider;
}
