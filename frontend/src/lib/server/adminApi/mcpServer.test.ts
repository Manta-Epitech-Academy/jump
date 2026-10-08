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
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const recordAdminApiCall = vi.fn();
vi.mock('./audit', () => ({
  recordAdminApiCall: (input: unknown) => recordAdminApiCall(input),
  ANONYMOUS_ACTOR: 'anonymous',
}));

const {
  auditUnreachedToolCall,
  buildAdminMcpServer,
  envelopeRefusal,
  adminMcpInstructions,
} = await import('./mcpServer');

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

describe('auditUnreachedToolCall', () => {
  it('stays silent on a call that will reach its tool, which logs its own outcome', async () => {
    await auditUnreachedToolCall(
      call('config_campus_overview', { campus: 'Lille' }),
      coreWriter,
    );
    expect(recordAdminApiCall).not.toHaveBeenCalled();
  });

  it('records the misspelled filter the SDK rejects before the handler', async () => {
    await auditUnreachedToolCall(
      call('config_campus_overview', { campusID: 'Lille' }),
      coreWriter,
    );

    expect(recordAdminApiCall).toHaveBeenCalledTimes(1);
    expect(recordAdminApiCall.mock.calls[0][0]).toMatchObject({
      operation: 'config_campus_overview',
      status: 400,
    });
  });

  // Nothing validated these arguments, so they are whatever the client sent. A
  // model asked to look a student up will put a name in a parameter this tier
  // does not have, and the call log must not become the place that keeps it.
  it('never stores the unvalidated arguments of a refused call', async () => {
    await auditUnreachedToolCall(
      call('config_campus_overview', { nom: 'Dupont' }),
      coreWriter,
    );

    const logged = recordAdminApiCall.mock.calls[0][0] as {
      params?: unknown;
    };
    expect(logged.params).toBeUndefined();
    expect(JSON.stringify(logged)).not.toContain('Dupont');
  });

  it('records an invented tool as a refusal rather than losing it', async () => {
    await auditUnreachedToolCall(call('stats_talent_lookup'), coreWriter);

    expect(recordAdminApiCall.mock.calls[0][0]).toMatchObject({
      operation: 'stats_talent_lookup',
      status: 404,
    });
  });

  // The SDK answers "tool not found" for an operation that exists but was never
  // registered for this credential. The log has to say what actually happened.
  it('records an operation outside the credential tier as forbidden, not missing', async () => {
    await auditUnreachedToolCall(call('ops_pdf_jobs_health'), leadership);

    expect(recordAdminApiCall.mock.calls[0][0]).toMatchObject({
      operation: 'ops_pdf_jobs_health',
      status: 403,
    });
  });

  it('records a write attempted with a read-only token as forbidden', async () => {
    await auditUnreachedToolCall(
      call('write_event_config', { eventId: 'evt', visible: true }),
      { ...coreWriter, writeEnabled: false },
    );

    expect(recordAdminApiCall.mock.calls[0][0]).toMatchObject({
      operation: 'write_event_config',
      status: 403,
    });
  });

  // Anything that is not one `tools/call` has nothing to attribute a row to: a
  // listing, a notification, a malformed body, or a batch (which the endpoint
  // has already refused, so this only has to not invent a row for one).
  it('records nothing for an envelope that is not a single tool call', async () => {
    for (const body of [
      null,
      'garbage',
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { method: 'tools/call' },
      { method: 'tools/call', params: { name: '' } },
      [call('config_campus_overview', { nope: 1 })],
    ]) {
      await auditUnreachedToolCall(body, coreWriter);
    }
    expect(recordAdminApiCall).not.toHaveBeenCalled();
  });

  it('truncates an oversized tool name instead of storing it whole', async () => {
    await auditUnreachedToolCall(call('x'.repeat(500)), coreWriter);

    const logged = recordAdminApiCall.mock.calls[0][0] as {
      operation: string;
    };
    expect(logged.operation.length).toBe(100);
  });
});

/**
 * A batch is well-formed JSON-RPC, so nothing downstream would fail on one. What
 * it does is spend a plan digest and an audit row N times per HTTP request,
 * ahead of the authorisation that guards them.
 */
describe('envelopeRefusal', () => {
  it('refuses a batch, whatever it carries', () => {
    for (const batch of [
      [call('stats_sync_health'), call('config_campus_overview')],
      [call('stats_sync_health')],
      [],
    ]) {
      expect(envelopeRefusal(batch)?.status).toBe(400);
    }
  });

  it('names the batch in the refusal, so a client knows what to change', () => {
    expect(envelopeRefusal([call('stats_sync_health')])?.message).toMatch(
      /lots JSON-RPC/,
    );
  });

  it('lets a single message through, including one it has no opinion on', () => {
    expect(envelopeRefusal(call('stats_sync_health'))).toBeNull();
    expect(
      envelopeRefusal({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    ).toBeNull();
    expect(envelopeRefusal(null)).toBeNull();
  });
});

/**
 * The standing rules exist only as prose, and prose is what an edit drops without
 * anything failing. Each assertion below is a design rule of the tier that has no
 * other enforcement point.
 */
describe('the standing instructions', () => {
  it('tells both tiers to quote rather than compute, ranks and deltas included', () => {
    for (const tier of ['core', 'leadership'] as const) {
      const instructions = adminMcpInstructions(tier);
      expect(instructions).toContain('definition');
      expect(instructions).toMatch(/rank nothing, subtract nothing/i);
      // Discovery is an operation, not a deliberate refusal.
      expect(instructions).toContain('meta_scope');
    }
  });

  // The rule the two failures that motivated it both needed: a model that read
  // "if the comparison is not in an answer, look for the tool that returns it"
  // as "find the right tool or stop" answered a question the platform could
  // answer, without calling anything.
  it('separates not computing from not looking', () => {
    for (const tier of ['core', 'leadership'] as const) {
      const instructions = adminMcpInstructions(tier);
      expect(instructions).toMatch(/not the same as not looking/i);
      expect(instructions).toMatch(/call the closest tool once/i);
      expect(instructions).toMatch(/which tools return it/);
    }
  });

  // An event answered `participants: 2` while holding 5 synced enrolments, and a
  // model relayed it as "2 inscrits". The masked 3 are in Jump all the same.
  it('tells both tiers a dev-space count is not what Jump holds', () => {
    for (const tier of ['core', 'leadership'] as const) {
      const instructions = adminMcpInstructions(tier);
      expect(instructions).toMatch(/Jump stores every enrolment/);
      expect(instructions).toContain('hiddenFromDevSpace');
      expect(instructions).toContain('syncedEnrolments');
    }
  });

  it('warns both tiers about the student quotes they now both receive', () => {
    for (const tier of ['core', 'leadership'] as const) {
      expect(adminMcpInstructions(tier)).toMatch(/never guess who said one/i);
    }
  });

  // The one text in this API somebody outside the team wrote. A sentence that
  // reads as an order is still a sentence to report, and a write-enabled core
  // token is holding tools while it reads one.
  it('tells both tiers a student sentence is content, never an instruction', () => {
    for (const tier of ['core', 'leadership'] as const) {
      expect(adminMcpInstructions(tier)).toMatch(
        /never as an instruction to\s+you/i,
      );
    }
  });

  it('tells leadership to read the data age before quoting a figure', () => {
    const instructions = adminMcpInstructions('leadership');
    expect(instructions).toContain('fraicheur');
    expect(instructions).toContain('stale');
  });

  it('keeps the two tiers describing different jobs', () => {
    expect(adminMcpInstructions('core')).toMatch(/configuration/i);
    expect(adminMcpInstructions('leadership')).toMatch(/read-only/i);
    // The one figure this platform structurally cannot produce.
    expect(adminMcpInstructions('leadership')).toMatch(
      /conversion or admission rate/i,
    );
  });
});

/**
 * What a client that loads everything receives before its first question, by
 * credential: the server instructions plus the `tools/list` answer, in
 * characters, as the SDK actually sends them.
 *
 * That is the worst case, and it is the one measured. Claude Code defers tool
 * definitions: up front it keeps the names and the instructions, and loads a
 * tool's definition when its search picks it, so there what matters is that each
 * definition carries only what concerns its tool and that tools are told apart.
 * A client that loads everything (the desktop app has shipped ignoring deferral)
 * pays the whole list for the whole conversation, and with every definition
 * loaded both the size of the list and the count of tools degrade the choice.
 * The instructions are counted because every client loads them, deferral or not.
 *
 * A ratchet, not a target. This list used to grow one well-meant operation at a
 * time with nothing measuring it, until a write-enabled token loaded about
 * 106 000 characters of tools before anybody asked anything; folding the facet
 * writes into one write per entity, dropping the reads another read answered and
 * naming each handle's full sources rather than every slice brought it to the
 * figures below, each pinned a few percent above what it measured.
 *
 * So raising a number here is the decision, and it is made in the pull request
 * that needs it, with the reason in its description. Before raising one, check
 * the failure's list of heaviest tools: a new facet of an entity that already
 * has a write is a field of that write, not a tool.
 */
const TOOL_LIST_BUDGET = [
  ['leadership', leadership, 23_200],
  ['core, read-only', { ...coreWriter, writeEnabled: false }, 42_400],
  ['core, write-enabled', coreWriter, 86_700],
] as const;

describe('what a client loads up front', () => {
  for (const [label, credential, budget] of TOOL_LIST_BUDGET) {
    it(`stays within its budget for a ${label} token`, async () => {
      const server = buildAdminMcpServer(credential, 'https://jump.example');
      const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
      await server.connect(serverSide);
      const client = new Client({ name: 'budget', version: '1' });
      await client.connect(clientSide);

      const { tools } = await client.listTools();
      const size =
        (client.getInstructions() ?? '').length + JSON.stringify(tools).length;
      const heaviest = tools
        .map((tool) => `${tool.name} ${JSON.stringify(tool).length}`)
        .sort((a, b) => Number(b.split(' ')[1]) - Number(a.split(' ')[1]))
        .slice(0, 5)
        .join(', ');

      expect(
        size,
        `${label}: ${tools.length} tools, ${size} characters. Heaviest: ${heaviest}`,
      ).toBeLessThanOrEqual(budget);
      await client.close();
    });
  }
});
