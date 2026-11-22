/**
 * The readiness ping runs against a real Postgres through the driver adapter,
 * which a mocked client cannot show: this is the answer `GET /api/health` gives
 * a probe when the pod is fine.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { checkReadiness } from '#lib/server/infra/health.ts';
import { assertTestDatabase } from './testDatabase';

describe('readiness (integration)', () => {
  beforeAll(() => {
    assertTestDatabase();
  });

  it('is ready when the database is up', async () => {
    await expect(checkReadiness()).resolves.toEqual({ ready: true });
  });
});
