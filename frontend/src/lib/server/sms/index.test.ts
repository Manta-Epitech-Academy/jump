/**
 * A provider's error never leaves the SMS façade with the number it rejected
 * (#518), on the real send and on the dev-redirect fan-out alike: the second is
 * a separate return, and a send path that skipped `redactFailure` would write
 * a minor's number to a log.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SendSmsResult, SmsMessage } from './types';
import { resolveSmsRouting } from './dev-redirect';

const send = vi.fn<(p: SmsMessage) => Promise<SendSmsResult>>();

vi.mock('./config', () => ({ smsProviderKind: 'brevo' }));
vi.mock('./providers/brevo', () => ({
  brevoSmsProvider: { name: 'brevo', send },
}));
vi.mock('./providers/null', () => ({
  nullSmsProvider: { name: 'null', send },
}));
vi.mock('./dev-redirect', async (original) => ({
  ...(await original<typeof import('./dev-redirect')>()),
  resolveSmsRouting: vi.fn(),
}));

const { sendSms } = await import('./index');

const message: SmsMessage = { to: '33612345678', body: 'Code 123456' };

beforeEach(() => {
  send.mockReset();
  send.mockImplementation(async (p) => ({
    ok: false,
    reason: 'api_error',
    statusCode: 400,
    message: `recipient ${p.to} is not reachable`,
  }));
});

describe('the SMS façade', () => {
  it('masks the number a real send was rejected for', async () => {
    vi.mocked(resolveSmsRouting).mockReturnValue({ kind: 'real' });
    expect(await sendSms(message)).toEqual({
      ok: false,
      reason: 'api_error',
      statusCode: 400,
      message: 'recipient [redacted phone] is not reachable',
    });
  });

  it('masks the debug number a redirected copy was rejected for', async () => {
    vi.mocked(resolveSmsRouting).mockReturnValue({
      kind: 'redirect',
      to: ['+33 7 00 00 00 01'],
    });
    expect(await sendSms(message)).toEqual({
      ok: false,
      reason: 'api_error',
      statusCode: 400,
      message: 'recipient [redacted phone] is not reachable',
    });
  });
});
