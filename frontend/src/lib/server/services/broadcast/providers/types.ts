export type SendOutcome =
  | { ok: true; providerMessageId?: string }
  | { ok: false; message: string };

export interface MailProvider {
  sendMail(args: {
    to: string;
    subject: string;
    html: string;
  }): Promise<SendOutcome>;
}

export interface SmsProvider {
  sendSms(args: { to: string; body: string }): Promise<SendOutcome>;
}
