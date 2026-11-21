/**
 * What a provider's error may say about a recipient never leaves the façade.
 *
 * Pinned both ways: each shape a Jump recipient's address or number takes is
 * masked, and the text around it that makes the error readable (a status, a
 * date, a short id) is not, or the redaction would cost the diagnosis it is
 * meant to keep.
 */
import { describe, it, expect } from 'vitest';
import { redactContacts, redactFailure } from './redactContacts';

describe('redactContacts', () => {
  it('masks an address, quoted or bracketed', () => {
    expect(redactContacts('"lea.martin+jump@example.fr" is invalid')).toBe(
      '"[redacted email]" is invalid',
    );
    expect(redactContacts('Invalid `to`: Léa <lea@example.com>')).toBe(
      'Invalid `to`: Léa <[redacted email]>',
    );
  });

  it('masks a number in each shape Jump and its providers write', () => {
    expect(redactContacts('bad recipient +33 6 12 34 56 78')).toBe(
      'bad recipient [redacted phone]',
    );
    expect(redactContacts('bad recipient 06.12.34.56.78')).toBe(
      'bad recipient [redacted phone]',
    );
    expect(redactContacts('bad recipient 33612345678')).toBe(
      'bad recipient [redacted phone]',
    );
  });

  it('leaves a status, a date and a short id alone', () => {
    const text = 'HTTP 429 on 2026-11-21, request 4f7254c5 (code 1101)';
    expect(redactContacts(text)).toBe(text);
  });
});

describe('redactFailure', () => {
  it('rewrites a failure and leaves a success untouched', () => {
    const ok = { ok: true as const, id: 'msg_1' };
    expect(redactFailure(ok)).toBe(ok);
    expect(
      redactFailure({
        ok: false as const,
        reason: 'api_error' as const,
        message: 'a@b.fr rejected',
      }),
    ).toMatchObject({ message: '[redacted email] rejected' });
  });
});
