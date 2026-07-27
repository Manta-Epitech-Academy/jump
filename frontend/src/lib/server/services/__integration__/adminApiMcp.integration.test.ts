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
 * answers, what it records), not `@hono/mcp`'s bridging.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { prisma } from '$lib/server/db';
import { assertTestDatabase } from './testDatabase';
import { mintToken } from '$lib/server/adminApi/tokens';
import { authenticateAdminApi } from '$lib/server/adminApi/guard';
import { buildAdminMcpServer } from '$lib/server/adminApi/mcpServer';

/** A client already connected to a server built for this token. */
async function clientFor(secret: string): Promise<Client> {
  const auth = await authenticateAdminApi({
    request: new Request('http://localhost/api/mcp', {
      headers: { authorization: `Bearer ${secret}` },
    }),
    locals: {} as App.Locals,
  });
  if (!auth.ok) throw new Error(`expected a valid credential: ${auth.message}`);

  const server = buildAdminMcpServer({
    caller: auth.caller,
    writeEnabled: auth.writeEnabled,
  });
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
  let leadershipSecret = '';

  beforeAll(async () => {
    assertTestDatabase();
    const admin = await prisma.bauth_user.create({
      data: { email: `mcp.admin.${stamp}@epitech.eu`, role: 'admin' },
    });
    adminUserId = admin.id;

    readSecret = (await mintToken(adminUserId, { label: 'MCP lecture' }))
      .secret;
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
    const overview = tools.find((t) => t.name === 'stats_events_overview');

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
    expect(payload.unresolvedErrors).toMatchObject({
      definition: expect.any(String),
    });

    const row = await prisma.adminApi_Call.findFirst({
      where: { actorUserId: adminUserId, operation: 'stats_sync_health' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.status).toBe(200);
  });

  // Not registered for this credential, so the protocol answers "unknown tool"
  // rather than running it. The refusal an admin can read is logged by the
  // endpoint's `auditUnreachedToolCalls`, which has its own unit test.
  it('does not let a read-only token call a write tool by name', async () => {
    const result = await (
      await clientFor(readSecret)
    ).callTool({
      name: 'write_event_activation',
      arguments: { eventId: 'whatever', visible: true },
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/not found/i);

    expect(
      await prisma.adminApi_Call.count({
        where: {
          actorUserId: adminUserId,
          operation: 'write_event_activation',
        },
      }),
    ).toBe(0);
  });

  it('refuses a scope that does not exist instead of answering zero', async () => {
    const result = await (
      await clientFor(readSecret)
    ).callTool({
      name: 'stats_events_overview',
      arguments: { campus: `Lile-${stamp}` },
    });

    expect(result.isError).toBe(true);
    // French, and it names what would have worked: the model asks again instead
    // of reporting a zero.
    expect(textOf(result)).toContain('Campus disponibles');

    const row = await prisma.adminApi_Call.findFirst({
      where: { actorUserId: adminUserId, operation: 'stats_events_overview' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.status).toBe(400);
  });
});
