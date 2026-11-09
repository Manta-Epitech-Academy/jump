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
vi.mock('./audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./audit')>()),
  recordAdminApiCall: (input: unknown) => recordAdminApiCall(input),
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

// What a client is told about each tool's effect, read off the wire: the hints
// are worth nothing if the SDK drops them, and a hint left unset defaults to the
// most dangerous reading (destructive, open-world).
describe('what each tool declares it does', () => {
  async function listedTools() {
    const server = buildAdminMcpServer(coreWriter, 'https://jump.example');
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: 'annotations', version: '1' });
    await client.connect(clientSide);
    const { tools } = await client.listTools();
    await client.close();
    return new Map(tools.map((tool) => [tool.name, tool]));
  }

  it('declares a read read-only and closed', async () => {
    const tools = await listedTools();
    expect(tools.get('stats_events')?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: false,
    });
  });

  // The case the old prefix rule got wrong: an ops_* tool that hard-deletes.
  it('declares an ops_* write as one, with its effect, in the hints and in the text', async () => {
    const tools = await listedTools();
    const reset = tools.get('ops_reset_closing');
    expect(reset?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(reset?.description).toMatch(/Changes data\. Safe to repeat/);
  });

  // The instructions name the sentence a model tells a write by, so the
  // sentence has to be on every write and on nothing else.
  it('marks every write, and only a write, with the sentence the instructions name', async () => {
    expect(adminMcpInstructions('core')).toContain('"Changes data."');
    for (const tool of (await listedTools()).values()) {
      expect(tool.description?.includes('Changes data.'), tool.name).toBe(
        tool.annotations?.readOnlyHint === false,
      );
    }
  });

  it('tells the model when a retry is not harmless', async () => {
    const tools = await listedTools();
    expect(tools.get('write_feedback_form_copy')?.description).toMatch(
      /Changes data\. NOT safe to repeat: every call makes another copy/,
    );
  });
});

/**
 * What Claude Code, the client the team uses, pays for this server, with a
 * ceiling on each part.
 *
 * It keeps the tool names and the server instructions up front, and loads one
 * tool's definition when its search picks it. So two things cost: the
 * instructions, on every conversation, and each definition, every time it is
 * chosen. The count of tools barely does: a name is some twenty characters.
 *
 * Each ceiling is fixed, and neither moves when the catalogue grows: a new
 * entity brings tools of its own, each measured against the same ceiling. That
 * is the difference with the budget this replaced, a total over the whole list
 * pinned per credential, which every new entity had to raise and which was
 * raised nine times between #393 and #491 without ever refusing anything. The
 * total is what a client that loads everything pays (about 109 000 characters
 * for a token that writes, at #496), and no client the team uses does.
 *
 * Over a ceiling, the fix is in what failed, not in the number: the
 * instructions take a rule only by giving one up, since text one tool needs
 * belongs in that tool; a definition sheds what it restates (a parameter's
 * description, the server instructions) before a field moves to a tool of its
 * own. Two tools a search cannot tell apart cost more than either ceiling, and
 * no measure here catches that: it is for review.
 */
const INSTRUCTIONS_CEILING = 3_200;
const DEFINITION_CEILING = 7_700;

describe('what Claude Code pays for this server', () => {
  it.each(['core', 'leadership'] as const)(
    'keeps the %s instructions under their ceiling',
    (tier) => {
      const size = adminMcpInstructions(tier).length;
      expect(
        size,
        `${tier} instructions: ${size} characters`,
      ).toBeLessThanOrEqual(INSTRUCTIONS_CEILING);
    },
  );

  it('keeps every tool definition under its ceiling, for every credential', async () => {
    const credentials = [
      leadership,
      { ...coreWriter, writeEnabled: false },
      coreWriter,
    ];
    const over: string[] = [];
    for (const credential of credentials) {
      const server = buildAdminMcpServer(credential, 'https://jump.example');
      const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
      await server.connect(serverSide);
      const client = new Client({ name: 'ceiling', version: '1' });
      await client.connect(clientSide);
      const { tools } = await client.listTools();
      for (const tool of tools) {
        const size = JSON.stringify(tool).length;
        if (size <= DEFINITION_CEILING) continue;
        over.push(
          `${tool.name} ${size} (description ${tool.description?.length ?? 0}, input schema ${JSON.stringify(tool.inputSchema).length})`,
        );
      }
      await client.close();
    }
    expect([...new Set(over)], 'definitions over the ceiling').toEqual([]);
  });
});
