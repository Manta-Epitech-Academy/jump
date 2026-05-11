import { env } from '$env/dynamic/private';
import { sendEmail } from '$lib/server/email/resend';
import type { MailProvider, SendOutcome } from './types';

const FROM_EMAIL = env.RESEND_FROM_EMAIL || 'Jump <noreply@jump.fr>';

export const resendMailProvider: MailProvider = {
  async sendMail({ to, subject, html }): Promise<SendOutcome> {
    const result = await sendEmail({ from: FROM_EMAIL, to, subject, html });
    if (result.ok) return { ok: true, providerMessageId: result.id };
    return { ok: false, message: `${result.reason}: ${result.message}` };
  },
};

export function getMailProvider(): MailProvider {
  return resendMailProvider;
}
