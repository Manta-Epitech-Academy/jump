/**
 * The audit invariant on the MCP path: every call leaves a row, including the
 * ones the protocol layer refuses before a tool runs.
 *
 * Worth its own test because nothing fails when it breaks. The SDK validates
 * arguments and rejects unknown tool names ahead of the registered handler, so a
 * model probing filters this tier does not offer used to leave no trace at all,
 * while the same request over HTTP logged a 400. A silent log reads exactly like
 * a quiet one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const recordAdminApiCall = vi.fn();
vi.mock('./audit', () => ({
  recordAdminApiCall: (input: unknown) => recordAdminApiCall(input),
  ANONYMOUS_ACTOR: 'anonymous',
}));

const { auditUnreachedToolCalls } = await import('./mcpServer');

/** A core token that may write: everything in the catalogue is offered to it. */
const coreWriter = {
  caller: { actorUserId: 'admin-1', tokenId: 'token-1', tier: 'core' as const },
  writeEnabled: true,
};

const leadership = {
  caller: {
    actorUserId: 'admin-1',
    tokenId: 'token-2',
    tier: 'leadership' as const,
  },
  writeEnabled: false,
};

const call = (name: string, args: Record<string, unknown> = {}) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name, arguments: args },
});

beforeEach(() => recordAdminApiCall.mockReset());

describe('auditUnreachedToolCalls', () => {
  it('stays silent on a call that will reach its tool, which logs its own outcome', async () => {
    await auditUnreachedToolCalls(
      call('stats_events_overview', { campus: 'Lille' }),
      coreWriter,
    );
    expect(recordAdminApiCall).not.toHaveBeenCalled();
  });

  it('records the misspelled filter the SDK rejects before the handler', async () => {
    await auditUnreachedToolCalls(
      call('stats_events_overview', { campusID: 'Lille' }),
      coreWriter,
    );

    expect(recordAdminApiCall).toHaveBeenCalledTimes(1);
    expect(recordAdminApiCall.mock.calls[0][0]).toMatchObject({
      operation: 'stats_events_overview',
      status: 400,
    });
  });

  // Nothing validated these arguments, so they are whatever the client sent. A
  // model asked to look a student up will put a name in a parameter this tier
  // does not have, and the call log must not become the place that keeps it.
  it('never stores the unvalidated arguments of a refused call', async () => {
    await auditUnreachedToolCalls(
      call('stats_events_overview', { nom: 'Dupont' }),
      coreWriter,
    );

    const logged = recordAdminApiCall.mock.calls[0][0] as {
      params?: unknown;
    };
    expect(logged.params).toBeUndefined();
    expect(JSON.stringify(logged)).not.toContain('Dupont');
  });

  it('records an invented tool as a refusal rather than losing it', async () => {
    await auditUnreachedToolCalls(call('stats_talent_lookup'), coreWriter);

    expect(recordAdminApiCall.mock.calls[0][0]).toMatchObject({
      operation: 'stats_talent_lookup',
      status: 404,
    });
  });

  // The SDK answers "tool not found" for an operation that exists but was never
  // registered for this credential. The log has to say what actually happened.
  it('records an operation outside the credential tier as forbidden, not missing', async () => {
    await auditUnreachedToolCalls(call('ops_pdf_jobs_health'), leadership);

    expect(recordAdminApiCall.mock.calls[0][0]).toMatchObject({
      operation: 'ops_pdf_jobs_health',
      status: 403,
    });
  });

  it('records a write attempted with a read-only token as forbidden', async () => {
    await auditUnreachedToolCalls(
      call('write_event_activation', { eventId: 'evt', visible: true }),
      { ...coreWriter, writeEnabled: false },
    );

    expect(recordAdminApiCall.mock.calls[0][0]).toMatchObject({
      operation: 'write_event_activation',
      status: 403,
    });
  });

  it('walks a batched envelope and ignores anything that is not a tool call', async () => {
    await auditUnreachedToolCalls(
      [
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        call('stats_events_overview', { nope: 1 }),
        call('stats_sync_health'),
      ],
      coreWriter,
    );

    expect(recordAdminApiCall).toHaveBeenCalledTimes(1);
    expect(recordAdminApiCall.mock.calls[0][0]).toMatchObject({ status: 400 });
  });

  it('leaves a malformed envelope to the transport', async () => {
    for (const body of [
      null,
      'garbage',
      { method: 'tools/call' },
      { method: 'tools/call', params: { name: '' } },
    ]) {
      await auditUnreachedToolCalls(body, coreWriter);
    }
    expect(recordAdminApiCall).not.toHaveBeenCalled();
  });

  it('truncates an oversized tool name instead of storing it whole', async () => {
    await auditUnreachedToolCalls(call('x'.repeat(500)), coreWriter);

    const logged = recordAdminApiCall.mock.calls[0][0] as {
      operation: string;
    };
    expect(logged.operation.length).toBe(100);
  });
});
