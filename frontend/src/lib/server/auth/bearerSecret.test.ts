import { describe, it, expect } from 'vitest';
import { bearerMatches } from './bearerSecret';

const call = (authorization?: string) =>
  new Request('http://localhost/api/jobs/x', {
    method: 'POST',
    headers: authorization ? { authorization } : undefined,
  });

describe('bearerMatches', () => {
  it('admits the secret sent as a bearer token', () => {
    expect(bearerMatches(call('Bearer s3cret'), 's3cret')).toBe(true);
  });

  it('refuses every call while the secret is unset or empty', () => {
    expect(bearerMatches(call('Bearer '), undefined)).toBe(false);
    expect(bearerMatches(call('Bearer '), '')).toBe(false);
    expect(bearerMatches(call('Bearer anything'), undefined)).toBe(false);
  });

  it('refuses a call with no Authorization header', () => {
    expect(bearerMatches(call(), 's3cret')).toBe(false);
  });

  it('refuses a wrong token, of the same length or not', () => {
    expect(bearerMatches(call('Bearer s3creT'), 's3cret')).toBe(false);
    expect(bearerMatches(call('Bearer s3cret-and-more'), 's3cret')).toBe(false);
  });
});
