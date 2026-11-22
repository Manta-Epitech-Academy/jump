import { describe, it, expect, vi } from 'vitest';

const secret: { value: string | undefined } = { value: undefined };
// A getter, so each test's write to `secret` reaches the service's import.
vi.mock('$app/env/private', () => ({
  get LOAD_TEST_SECRET() {
    return secret.value;
  },
}));

const { assertLoadTestAuth } = await import('./loadTestService');

describe('loadTestService - assertLoadTestAuth', () => {
  it('refuses access with 404 if secret is unset', () => {
    secret.value = '';

    const req = new Request('http://localhost/api/test/login-as', {
      headers: { authorization: 'Bearer secret123' },
    });

    expect(() => assertLoadTestAuth(req)).toThrowError();
  });

  it('refuses access with 401 if bearer token does not match secret', () => {
    secret.value = 'correct_secret';

    const req = new Request('http://localhost/api/test/login-as', {
      headers: { authorization: 'Bearer wrong_secret' },
    });

    expect(() => assertLoadTestAuth(req)).toThrowError();
  });

  it('grants access when bearer token matches secret', () => {
    secret.value = 'correct_secret';

    const req = new Request('http://localhost/api/test/login-as', {
      headers: { authorization: 'Bearer correct_secret' },
    });

    expect(() => assertLoadTestAuth(req)).not.toThrow();
  });
});
