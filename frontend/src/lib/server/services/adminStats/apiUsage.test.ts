/**
 * The friction half of the usage log: what got refused, and what callers asked
 * for that does not exist.
 *
 * Pinned because the first version of this ranking put `mcp_request` at the top
 * with a 100 % refusal rate, which reads as a broken tool and is in fact
 * unauthenticated traffic reaching the endpoint. A friction report whose loudest
 * line is not an operation sends whoever reads it after the wrong thing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const callFindMany = vi.fn();
const tokenFindMany = vi.fn();

vi.mock('$lib/server/db', () => ({
  prisma: {
    adminApi_Call: { findMany: () => callFindMany() },
    adminApi_Token: { findMany: () => tokenFindMany() },
  },
}));

const { getApiUsage } = await import('./apiUsage');

const KNOWN = ['stats_sync_health', 'stats_events_overview'];

function call(operation: string, status: number) {
  return { operation, status, tokenId: null, createdAt: new Date(0) };
}

beforeEach(() => {
  callFindMany.mockReset();
  tokenFindMany.mockReset();
  tokenFindMany.mockResolvedValue([]);
});

describe('mostRefused', () => {
  it('ranks real operations by their own refusal rate', async () => {
    callFindMany.mockResolvedValue([
      call('stats_sync_health', 200),
      call('stats_sync_health', 400),
      call('stats_events_overview', 400),
    ]);

    const usage = await getApiUsage({}, KNOWN);

    expect(
      usage.mostRefused.value.map((r) => [r.operation, r.refusedShare]),
    ).toEqual([
      ['stats_events_overview', 100],
      ['stats_sync_health', 50],
    ]);
  });

  // The defect this test exists for.
  it('leaves out the envelope name, which is not an operation', async () => {
    callFindMany.mockResolvedValue([
      call('mcp_request', 401),
      call('mcp_request', 401),
      call('stats_sync_health', 400),
    ]);

    const usage = await getApiUsage({}, KNOWN);

    expect(usage.mostRefused.value.map((r) => r.operation)).toEqual([
      'stats_sync_health',
    ]);
    expect(usage.inventedOperations.value).toEqual([]);
  });

  it('omits an operation nobody was refused on', async () => {
    callFindMany.mockResolvedValue([call('stats_sync_health', 200)]);

    const usage = await getApiUsage({}, KNOWN);

    expect(usage.mostRefused.value).toEqual([]);
  });
});

describe('inventedOperations', () => {
  // The most direct evidence of a question the catalogue cannot answer, and it
  // was recorded and never read until now.
  it('reports names that are not in the catalogue, most attempted first', async () => {
    callFindMany.mockResolvedValue([
      call('stats_talent_search', 404),
      call('stats_talent_search', 404),
      call('stats_conversion_rate', 404),
      call('stats_sync_health', 200),
    ]);

    const usage = await getApiUsage({}, KNOWN);

    expect(usage.inventedOperations.value).toEqual([
      { name: 'stats_talent_search', attempts: 2 },
      { name: 'stats_conversion_rate', attempts: 1 },
    ]);
  });

  it('does not report a catalogue operation as invented', async () => {
    callFindMany.mockResolvedValue([call('stats_sync_health', 404)]);

    const usage = await getApiUsage({}, KNOWN);

    expect(usage.inventedOperations.value).toEqual([]);
  });
});

describe('per-operation refusal rate', () => {
  it('tells a strict filter apart from a tool nobody can call', async () => {
    callFindMany.mockResolvedValue([
      ...Array.from({ length: 99 }, () => call('stats_sync_health', 200)),
      call('stats_sync_health', 400),
      call('stats_events_overview', 400),
    ]);

    const usage = await getApiUsage({}, KNOWN);
    const byName = new Map(
      usage.byOperation.value.map((row) => [row.operation, row.refusedShare]),
    );

    expect(byName.get('stats_sync_health')).toBe(1);
    expect(byName.get('stats_events_overview')).toBe(100);
    // The global rate cannot express that difference.
    expect(usage.refusalRate.value).toBe(2);
  });
});
