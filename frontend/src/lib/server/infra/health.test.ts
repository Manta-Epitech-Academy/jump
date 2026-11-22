/**
 * The readiness answer holds its deadline.
 *
 * A database that hangs instead of refusing is the case a probe cannot tell
 * from a dead pod unless the check gives up on its own: what is pinned here is
 * that a hung ping answers "not ready" within the deadline, and that a refused
 * one does too, rather than throwing out of the route as a 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '#lib/server/db.ts';

vi.mock('#lib/server/db.ts', () => ({ prisma: { $queryRaw: vi.fn() } }));

const { checkReadiness } = await import('./health');
const queryRaw = vi.mocked(prisma.$queryRaw);

beforeEach(() => {
  queryRaw.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('checkReadiness', () => {
  it('is ready when the database answers', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }] as never);
    await expect(checkReadiness(50)).resolves.toEqual({ ready: true });
  });

  it('is not ready when the database refuses', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused') as never);
    await expect(checkReadiness(50)).resolves.toEqual({ ready: false });
  });

  it('gives up on a database that hangs, within its deadline', async () => {
    queryRaw.mockReturnValue(new Promise(() => {}) as never);
    const started = Date.now();
    await expect(checkReadiness(30)).resolves.toEqual({ ready: false });
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
