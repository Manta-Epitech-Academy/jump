/**
 * The MCP surface driven by a real MCP client, over the protocol.
 *
 * The tool list and the tool call were the one consumer with no test: the guard,
 * the catalogue and the HTTP wrapper each had theirs, and "the tools a credential
 * is offered" was checked as a pure function while the thing that registers them
 * was not. That is the wrong half to leave uncovered, since the pilot's only real
 * client speaks this protocol.
 *
 * Uses the SDK's in-memory transport rather than an HTTP round trip: what is
 * under test is the server we build (which tools exist for whom, what a call
 * answers, what it records), not `@hono/mcp`'s bridging. The audit rows of what
 * the protocol layer refuses before our handler runs belong to the endpoint,
 * though, so the last block posts to the endpoint itself.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { createAdminAccount } from './adminApiAccount';
import { mintToken } from '$lib/server/adminApi/tokens';
import { authenticateAdminApi } from '$lib/server/adminApi/guard';
import { buildAdminMcpServer } from '$lib/server/adminApi/mcpServer';
import { ANONYMOUS_ACTOR } from '$lib/server/adminApi/audit';
import { POST as mcpEndpoint } from '../../../../routes/api/mcp/+server';

/** A client already connected to a server built for this token. */
async function clientFor(secret: string): Promise<Client> {
  const auth = await authenticateAdminApi({
    request: new Request('http://localhost/api/mcp', {
      headers: { authorization: `Bearer ${secret}` },
    }),
    locals: {} as App.Locals,
  });
  if (!auth.ok) throw new Error(`expected a valid credential: ${auth.message}`);

  const server = buildAdminMcpServer(
    {
      caller: auth.caller,
      writeEnabled: auth.writeEnabled,
    },
    'http://localhost',
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

/**
 * The text a client reads off a tool result. Takes `unknown` because
 * `callTool`'s return type is a union that still carries the protocol's legacy
 * `toolResult` shape; what this tier always answers with is text content.
 */
function textOf(result: unknown): string {
  const { content } = result as { content?: unknown };
  const [first] = Array.isArray(content)
    ? (content as { type: string; text?: string }[])
    : [];
  return first?.text ?? '';
}

describe('the admin MCP server (integration)', () => {
  const stamp = Date.now();
  let adminUserId = '';
  let readSecret = '';
  let readTokenId = '';
  let leadershipSecret = '';

  beforeAll(async () => {
    assertTestDatabase();
    const admin = await createAdminAccount(`mcp.admin.${stamp}@epitech.eu`);
    adminUserId = admin.id;

    const readToken = await mintToken(adminUserId, { label: 'MCP lecture' });
    readSecret = readToken.secret;
    readTokenId = readToken.id;
    leadershipSecret = (
      await mintToken(adminUserId, {
        label: 'MCP direction',
        tier: 'leadership',
      })
    ).secret;
  });

  afterAll(async () => {
    try {
      await prisma.adminApi_Call.deleteMany({
        where: { actorUserId: adminUserId },
      });
      await prisma.bauth_user.delete({ where: { id: adminUserId } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  it('offers a read-only token the reads, and no tool that mutates', async () => {
    const { tools } = await (await clientFor(readSecret)).listTools();
    const names = tools.map((t) => t.name);

    expect(names).toContain('stats_sync_health');
    expect(names.some((n) => n.startsWith('write_'))).toBe(false);
    expect(names.some((n) => n.startsWith('bulk_'))).toBe(false);
  });

  // The strict schema is not just enforced, it is advertised: a model is told up
  // front that an extra filter is not accepted, which is what stops it inventing
  // one. This is the assertion that fails if a raw shape is ever handed back to
  // the SDK.
  it('advertises each tool as refusing unknown parameters', async () => {
    const { tools } = await (await clientFor(readSecret)).listTools();
    const overview = tools.find((t) => t.name === 'config_campus_overview');

    expect(overview?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });
    expect(Object.keys(overview?.inputSchema.properties ?? {})).toContain(
      'campus',
    );
  });

  it('shows a leadership token the steering figures only', async () => {
    const { tools } = await (await clientFor(leadershipSecret)).listTools();
    const names = tools.map((t) => t.name);

    expect(names).toContain('stats_cohort_profile');
    expect(names).not.toContain('ops_pdf_jobs_health');
    expect(names).not.toContain('config_event_detail');
  });

  it('answers a tool call with figures that carry their definition, and logs it', async () => {
    const result = await (
      await clientFor(readSecret)
    ).callTool({ name: 'stats_sync_health', arguments: {} });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(textOf(result));
    // The tier's whole contract: a figure never travels without what it counts.
    expect(payload.openErrors).toMatchObject({
      definition: expect.any(String),
    });

    const row = await prisma.adminApi_Call.findFirst({
      where: { actorUserId: adminUserId, operation: 'stats_sync_health' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.status).toBe(200);
  });

  // Not registered for this credential, so the protocol answers "unknown tool"
  // rather than running it: the server never sees this call. The row it costs
  // is written ahead of the server by the endpoint, and is asserted over HTTP
  // in the last block.
  it('does not let a read-only token call a write tool by name', async () => {
    const result = await (
      await clientFor(readSecret)
    ).callTool({
      name: 'write_event_config',
      arguments: { eventId: 'whatever', visible: true },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/not found/i);
  });

  it('refuses a scope that does not exist instead of answering zero', async () => {
    const result = await (
      await clientFor(readSecret)
    ).callTool({
      name: 'config_campus_overview',
      arguments: { campus: `Lile-${stamp}` },
    });

    expect(result.isError).toBe(true);
    // French, and it names what would have worked: the model asks again instead
    // of reporting a zero.
    expect(textOf(result)).toContain('Campus disponibles');

    const row = await prisma.adminApi_Call.findFirst({
      where: { actorUserId: adminUserId, operation: 'config_campus_overview' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.status).toBe(400);
  });
  /**
   * Every call leaves exactly one `AdminApi_Call` row, refusals included, and
   * that is a property of the endpoint rather than of the server: the SDK turns
   * away an unknown tool, a tool the credential is not offered and bad arguments
   * before any handler runs, so `auditUnreachedToolCall` records those ahead of
   * it, and authentication and the batch refusal happen before the server
   * exists. Driven through the real `POST`, the way a client reaches it.
   */
  describe('the endpoint, over HTTP', () => {
    const anonymousRows: string[] = [];

    afterAll(async () => {
      await prisma.adminApi_Call.deleteMany({
        where: { id: { in: anonymousRows } },
      });
    });

    function post(body: unknown, bearer: string | null) {
      const request = new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        },
        body: JSON.stringify(body),
      });
      return mcpEndpoint({
        request,
        url: new URL(request.url),
        locals: {} as App.Locals,
      } as unknown as Parameters<typeof mcpEndpoint>[0]);
    }

    type Answered = {
      status: number;
      contentType: string | null;
      body: string;
    };

    /** The JSON-RPC answer, whether the transport replied in JSON or over SSE. */
    function rpcAnswer({ contentType, body }: Answered) {
      if (!contentType?.includes('text/event-stream')) return JSON.parse(body);
      const data = body
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .at(-1);
      return JSON.parse(data!.slice('data:'.length));
    }

    /** Whether the protocol refused the call, however this SDK version says so. */
    const refused = (answer: {
      error?: unknown;
      result?: { isError?: boolean };
    }) => answer.error !== undefined || answer.result?.isError === true;

    /**
     * The audit rows a request left, under the admin or under nobody. The body
     * is read first: over SSE the tool runs while the stream is consumed, so its
     * row exists only once the answer has been read.
     */
    async function rowsLeftBy(send: () => Response | Promise<Response>) {
      const where = {
        actorUserId: { in: [adminUserId, ANONYMOUS_ACTOR] },
      };
      const known = new Set(
        (
          await prisma.adminApi_Call.findMany({ where, select: { id: true } })
        ).map((row) => row.id),
      );
      const response = await send();
      const answered: Answered = {
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: await response.text(),
      };
      const rows = (
        await prisma.adminApi_Call.findMany({
          where,
          select: {
            id: true,
            operation: true,
            status: true,
            actorUserId: true,
            tokenId: true,
          },
        })
      ).filter((row) => !known.has(row.id));
      anonymousRows.push(
        ...rows
          .filter((row) => row.actorUserId === ANONYMOUS_ACTOR)
          .map((row) => row.id),
      );
      return { answered, rows };
    }

    const toolCall = (name: string, args: Record<string, unknown>) => ({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    });

    it.each([
      {
        case: 'an unknown tool',
        name: () => `invented_${stamp}`,
        args: {},
        status: 404,
        isRefused: true,
      },
      {
        case: 'a write the read-only token is not offered',
        name: () => 'write_event_config',
        args: { eventId: 'whatever', visible: true },
        status: 403,
        isRefused: true,
      },
      {
        case: 'arguments the tool does not take',
        name: () => 'config_campus_overview',
        args: { campusID: 'Lille' },
        status: 400,
        isRefused: true,
      },
      {
        case: 'a valid read',
        name: () => 'stats_sync_health',
        args: {},
        status: 200,
        isRefused: false,
      },
    ])('logs one row for $case', async ({ name, args, status, isRefused }) => {
      const { answered, rows } = await rowsLeftBy(() =>
        post(toolCall(name(), args), readSecret),
      );

      expect(refused(rpcAnswer(answered))).toBe(isRefused);
      expect(rows).toEqual([
        expect.objectContaining({
          operation: name(),
          status,
          actorUserId: adminUserId,
          tokenId: readTokenId,
        }),
      ]);
    });

    it('logs one row for a batch it refuses', async () => {
      const { answered, rows } = await rowsLeftBy(() =>
        post(
          [
            toolCall('stats_sync_health', {}),
            toolCall('stats_sync_health', {}),
          ],
          readSecret,
        ),
      );

      expect(answered.status).toBe(400);
      expect(rows).toEqual([
        expect.objectContaining({ operation: 'mcp_request', status: 400 }),
      ]);
    });

    it('logs one row for a bearer it does not know', async () => {
      const { answered, rows } = await rowsLeftBy(() =>
        post(toolCall('stats_sync_health', {}), 'jump_nope'),
      );

      expect(answered.status).toBe(401);
      expect(rows).toEqual([
        expect.objectContaining({
          operation: 'mcp_request',
          status: 401,
          actorUserId: ANONYMOUS_ACTOR,
          tokenId: null,
        }),
      ]);
    });
  });
});
