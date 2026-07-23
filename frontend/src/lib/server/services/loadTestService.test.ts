import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assertLoadTestAuth } from './loadTestService';
import { env } from '$env/dynamic/private';

describe('loadTestService - assertLoadTestAuth', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = env.LOAD_TEST_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    env.LOAD_TEST_SECRET = originalSecret;
  });

  it('refuses access with 404 in production environment', () => {
    process.env.NODE_ENV = 'production';
    env.LOAD_TEST_SECRET = 'secret123';

    const req = new Request('http://localhost/api/test/login-as', {
      headers: { authorization: 'Bearer secret123' },
    });

    expect(() => assertLoadTestAuth(req)).toThrowError();
  });

  it('refuses access with 404 if secret is unset', () => {
    process.env.NODE_ENV = 'test';
    env.LOAD_TEST_SECRET = '';

    const req = new Request('http://localhost/api/test/login-as', {
      headers: { authorization: 'Bearer secret123' },
    });

    expect(() => assertLoadTestAuth(req)).toThrowError();
  });

  it('refuses access with 401 if bearer token does not match secret', () => {
    process.env.NODE_ENV = 'test';
    env.LOAD_TEST_SECRET = 'correct_secret';

    const req = new Request('http://localhost/api/test/login-as', {
      headers: { authorization: 'Bearer wrong_secret' },
    });

    expect(() => assertLoadTestAuth(req)).toThrowError();
  });

  it('grants access when bearer token matches secret in non-production', () => {
    process.env.NODE_ENV = 'test';
    env.LOAD_TEST_SECRET = 'correct_secret';

    const req = new Request('http://localhost/api/test/login-as', {
      headers: { authorization: 'Bearer correct_secret' },
    });

    expect(() => assertLoadTestAuth(req)).not.toThrow();
  });
});
