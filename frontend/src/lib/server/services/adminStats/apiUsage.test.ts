/**
 * The friction half of the usage log: what got refused, and what callers asked
 * for that does not exist.
 *
 * Pinned because the first version of this ranking put `mcp_request` at the top
 * with a 100 % refusal rate, which reads as a broken tool and is in fact
 * unauthenticated traffic reaching the endpoint. A friction report whose loudest
 * line is not an operation sends whoever reads it after the wrong thing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const callFindMany = vi.fn();
const tokenFindMany = vi.fn();

vi.mock('$lib/server/db', () => ({
  prisma: {
    adminApi_Call: { findMany: () => callFindMany() },
    adminApi_Token: { findMany: () => tokenFindMany() },
  },
}));

const { getApiUsage, RECOVERY_WINDOW_MINUTES } = await import('./apiUsage');

const KNOWN = ['stats_sync_health', 'config_campus_overview'];

function call(operation: string, status: number) {
  return { operation, status, tokenId: null, createdAt: new Date(0) };
}

/** A token's call, `minute` minutes into the epoch, so order and gaps are explicit. */
function tokenCall(
  tokenId: string | null,
  operation: string,
  status: number,
  minute: number,
) {
  return {
    operation,
    status,
    tokenId,
    createdAt: new Date(minute * 60_000),
  };
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
      call('config_campus_overview', 400),
    ]);

    const usage = await getApiUsage({}, KNOWN);

    expect(
      usage.mostRefused.value.map((r) => [r.operation, r.refusedShare]),
    ).toEqual([
      ['config_campus_overview', 100],
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

  // A retired operation's calls stay in the log for the whole retention, its
  // successes and its refused filters alike. It existed when it answered or
  // refused a filter; only a caller still reaching for it since is reaching for
  // something that is not there, and that is the one the envelope answers 404.
  it('counts a retired name only by the calls refused since it went', async () => {
    callFindMany.mockResolvedValue([
      call('write_event_activation', 200),
      call('write_event_activation', 400),
      call('write_event_activation', 404),
      call('bulk_event_modules', 200),
      call('bulk_event_modules', 400),
    ]);

    const usage = await getApiUsage({}, KNOWN);

    expect(usage.inventedOperations.value).toEqual([
      { name: 'write_event_activation', attempts: 1 },
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
      call('config_campus_overview', 400),
    ]);

    const usage = await getApiUsage({}, KNOWN);
    const byName = new Map(
      usage.byOperation.value.map((row) => [row.operation, row.refusedShare]),
    );

    expect(byName.get('stats_sync_health')).toBe(1);
    expect(byName.get('config_campus_overview')).toBe(100);
    // The global rate cannot express that difference.
    expect(usage.refusalRate.value).toBe(2);
  });
});

// Whether a refusal told its caller what to do next: the figure that says which
// error messages work, which the refusal rate cannot.
describe('recovery after a refusal', () => {
  const later = RECOVERY_WINDOW_MINUTES + 1;

  it('counts a refusal the same token got past within the window', async () => {
    callFindMany.mockResolvedValue([
      tokenCall('t1', 'config_campus_overview', 400, 0),
      tokenCall('t1', 'meta_scope', 200, 1),
      tokenCall('t1', 'stats_sync_health', 400, 10),
      tokenCall('t1', 'stats_sync_health', 200, 10 + later),
    ]);

    const usage = await getApiUsage({}, KNOWN);
    const byName = new Map(
      usage.byOperation.value.map((row) => [row.operation, row]),
    );

    expect(usage.recoveryRate.value).toBe(50);
    expect(byName.get('config_campus_overview')).toMatchObject({
      recovered: 1,
      recoveredShare: 100,
    });
    expect(byName.get('stats_sync_health')).toMatchObject({
      recovered: 0,
      recoveredShare: 0,
    });
  });

  it("does not credit a refusal with another token's success", async () => {
    callFindMany.mockResolvedValue([
      tokenCall('t1', 'stats_sync_health', 400, 0),
      tokenCall('t2', 'stats_sync_health', 200, 1),
    ]);

    const usage = await getApiUsage({}, KNOWN);

    expect(usage.recoveryRate.value).toBe(0);
  });

  // A browser session is a person and an unidentified caller has nothing to
  // recover with: neither counts, so neither drags the figure down.
  it('judges only the refusals of a token', async () => {
    callFindMany.mockResolvedValue([
      tokenCall(null, 'stats_sync_health', 400, 0),
      tokenCall(null, 'mcp_request', 401, 0),
    ]);

    const usage = await getApiUsage({}, KNOWN);

    expect(usage.recoveryRate.value).toBeNull();
  });

  // Each of these, judged, would move the figure without saying anything about
  // a refusal message: one that may still be recovered, a failure that is ours,
  // and a request no operation was the subject of.
  describe('leaves out what cannot be judged', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(100 * 60_000));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('a refusal younger than the window', async () => {
      callFindMany.mockResolvedValue([
        tokenCall('t1', 'stats_sync_health', 400, 100 - 1),
      ]);

      const usage = await getApiUsage({}, KNOWN);

      expect(usage.recoveryRate.value).toBeNull();
    });

    it('a failure on our side', async () => {
      callFindMany.mockResolvedValue([
        tokenCall('t1', 'stats_sync_health', 500, 0),
        tokenCall('t1', 'stats_sync_health', 200, 1),
      ]);

      const usage = await getApiUsage({}, KNOWN);

      expect(usage.recoveryRate.value).toBeNull();
    });

    // The transport's "not found" answered it, not a message Jump wrote; the
    // name is counted where it belongs, in inventedOperations.
    it('a refusal on a name the catalogue does not hold', async () => {
      callFindMany.mockResolvedValue([
        tokenCall('t1', 'stats_talent_lookup', 404, 0),
        tokenCall('t1', 'stats_sync_health', 200, 1),
      ]);

      const usage = await getApiUsage({}, KNOWN);

      expect(usage.recoveryRate.value).toBeNull();
    });

    it('a transport name as the success that recovers a refusal', async () => {
      callFindMany.mockResolvedValue([
        tokenCall('t1', 'stats_sync_health', 400, 0),
        tokenCall('t1', 'openapi_document', 200, 1),
      ]);

      const usage = await getApiUsage({}, KNOWN);

      expect(usage.recoveryRate.value).toBe(0);
    });
  });
});
