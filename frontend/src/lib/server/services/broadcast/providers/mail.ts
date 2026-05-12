import { env } from '$env/dynamic/private';
import {
  sendEmail,
  sendEmailBatch,
  RESEND_BATCH_MAX,
} from '$lib/server/email/resend';
import type { MailMessage, MailProvider, SendOutcome } from './types';

const FROM_EMAIL = env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>';

export const resendMailProvider: MailProvider = {
  async sendMail({ to, subject, html }): Promise<SendOutcome> {
    const result = await sendEmail({ from: FROM_EMAIL, to, subject, html });
    if (result.ok) return { ok: true, providerMessageId: result.id };
    return { ok: false, message: `${result.reason}: ${result.message}` };
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
      for (const r of results) {
        outcomes.push(
          r.ok
            ? { ok: true, providerMessageId: r.id }
            : { ok: false, message: `${r.reason}: ${r.message}` },
        );
      }
    }
    return outcomes;
  },
};

export function getMailProvider(): MailProvider {
  return resendMailProvider;
}
