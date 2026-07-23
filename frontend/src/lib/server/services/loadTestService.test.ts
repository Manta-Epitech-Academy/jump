import { describe, it, expect, afterEach } from 'vitest';
import { assertLoadTestAuth } from './loadTestService';
import { env } from '$env/dynamic/private';

describe('loadTestService - assertLoadTestAuth', () => {
  const originalSecret = env.LOAD_TEST_SECRET;

  afterEach(() => {
    env.LOAD_TEST_SECRET = originalSecret;
  });

  it('refuses access with 404 if secret is unset', () => {
    env.LOAD_TEST_SECRET = '';

    const req = new Request('http://localhost/api/test/login-as', {
      headers: { authorization: 'Bearer secret123' },
    });

    expect(() => assertLoadTestAuth(req)).toThrowError();
  });

  it('refuses access with 401 if bearer token does not match secret', () => {
    env.LOAD_TEST_SECRET = 'correct_secret';

    const req = new Request('http://localhost/api/test/login-as', {
      headers: { authorization: 'Bearer wrong_secret' },
    });

    expect(() => assertLoadTestAuth(req)).toThrowError();
  });

  it('grants access when bearer token matches secret', () => {
    env.LOAD_TEST_SECRET = 'correct_secret';

    const req = new Request('http://localhost/api/test/login-as', {
      headers: { authorization: 'Bearer correct_secret' },
    });

    expect(() => assertLoadTestAuth(req)).not.toThrow();
  });
});
