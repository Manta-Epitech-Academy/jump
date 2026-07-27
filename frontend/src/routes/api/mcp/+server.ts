/**
 * MCP endpoint (streamable HTTP) for the curated admin operations.
 *
 * Auth is the same bearer token as the HTTP endpoints, checked here before the
 * protocol layer sees anything: an unauthenticated caller never reaches a tool.
 * Refusals are logged like any other call, so brute-force attempts show up in
 * `AdminApi_Call` instead of nowhere.
 *
 * Why a Hono shim: `@hono/mcp`'s transport is the fetch-native one (it takes a
 * Hono `Context`, not Node's `req`/`res`, which `adapter-node` does not hand us),
 * so a two-line Hono app bridges SvelteKit's `Request` to it. `hono` was already
 * a dependency.
 *
 * Stateless by construction (`sessionIdGenerator: undefined`, a fresh server and
 * transport per request): the pods scale horizontally, so no session state may
 * live in process memory.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { Hono } from 'hono';
import { StreamableHTTPTransport } from '@hono/mcp';
import { authenticateAdminApi } from '$lib/server/adminApi/guard';
import { recordAdminApiCall } from '$lib/server/adminApi/audit';
import {
  buildAdminMcpServer,
  auditUnreachedToolCalls,
} from '$lib/server/adminApi/mcpServer';

/**
 * The request body as JSON, or null for a body that is absent (GET, DELETE) or
 * unparseable. A malformed envelope is the transport's to reject, not ours.
 */
async function readJson(request: Request): Promise<unknown> {
  try {
    const raw = await request.text();
    return raw.trim() ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const handle: RequestHandler = async (event) => {
  const auth = await authenticateAdminApi(event);
  if (!auth.ok) {
    await recordAdminApiCall({
      caller: auth.caller,
      operation: 'mcp_request',
      status: auth.status,
    });
    return json({ error: auth.message }, { status: auth.status });
  }

  // The credential, not just the caller: it decides which tools get registered
  // (tier, write capability) and is re-checked on every tool call for the parts
  // that cannot be settled once, like the quotas.
  const credential = { caller: auth.caller, writeEnabled: auth.writeEnabled };

  // Read off a clone, so the transport still receives an unread body. This
  // endpoint already logs what never reaches a tool (an unauthenticated request,
  // above); a tool call the protocol layer is about to refuse belongs to the
  // same job, and the SDK settles those before our handler could log them.
  await auditUnreachedToolCalls(
    await readJson(event.request.clone()),
    credential,
  );

  const server = buildAdminMcpServer(credential);
  const transport = new StreamableHTTPTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  const app = new Hono().all(
    '*',
    async (c) =>
      // A notification carries no reply: the transport returns nothing and the
      // spec's answer is 202 Accepted.
      (await transport.handleRequest(c)) ?? new Response(null, { status: 202 }),
  );

  return app.fetch(event.request);
};

export const POST = handle;
// GET (would-be SSE stream) and DELETE (session teardown) are answered by the
// transport itself - 405 in stateless mode - rather than by SvelteKit's generic
// "method not allowed", so a client gets a protocol-shaped response.
export const GET = handle;
export const DELETE = handle;
