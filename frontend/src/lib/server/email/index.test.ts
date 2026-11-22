/**
 * A provider's error never leaves the mail façade with the address it
 * rejected (#518). `redactContacts` is pinned on its own; this pins that every
 * way out of the façade goes through it, since a send path that skipped it
 * would write the address to a log and to `BroadcastRecipient.errorMessage`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MailMessage, SendEmailResult } from './types';

const send = vi.fn<(p: MailMessage) => Promise<SendEmailResult>>();
const sendBatch = vi.fn<(p: MailMessage[]) => Promise<SendEmailResult[]>>();
const provider = { batchMax: 100, send, sendBatch };

vi.mock('./config', () => ({ mailProviderKind: 'resend', MAIL_FROM: 'x' }));
vi.mock('./providers/resend', () => ({
  resendProvider: { name: 'resend', ...provider },
}));
vi.mock('./providers/mailjet', () => ({
  mailjetProvider: { name: 'mailjet', ...provider },
}));
vi.mock('./dev-redirect', async (original) => ({
  ...(await original<typeof import('./dev-redirect')>()),
  resolveMailRouting: vi.fn(() => ({ kind: 'real' })),
}));

const { sendEmail, sendEmailBatch } = await import('./index');

const message: MailMessage = {
  from: 'jump@example.fr',
  to: 'lea.martin@example.fr',
  subject: 's',
  html: 'h',
};
const rejected = (to: string): SendEmailResult => ({
  ok: false,
  reason: 'api_error',
  statusCode: 400,
  message: `"${to}" is not a valid recipient`,
});

beforeEach(() => {
  send.mockReset();
  sendBatch.mockReset();
});

describe('the mail façade', () => {
  it('masks the address a single send was rejected for', async () => {
    send.mockResolvedValue(rejected('lea.martin@example.fr'));
    expect(await sendEmail(message)).toEqual({
      ok: false,
      reason: 'api_error',
      statusCode: 400,
      message: '"[redacted email]" is not a valid recipient',
    });
  });

  it('masks it on every failed entry of a batch, and keeps the successes', async () => {
    sendBatch.mockResolvedValue([
      { ok: true, id: 'm1' },
      rejected('noe@example.fr'),
    ]);
    expect(await sendEmailBatch([message, message])).toEqual([
      { ok: true, id: 'm1' },
      {
        ok: false,
        reason: 'api_error',
        statusCode: 400,
        message: '"[redacted email]" is not a valid recipient',
      },
    ]);
  });
});
