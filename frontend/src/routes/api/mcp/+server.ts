/**
 * MCP endpoint (streamable HTTP) for the curated admin operations.
 *
 * Auth is the same bearer token as the HTTP endpoints, checked here before the
 * protocol layer sees anything: an unauthenticated caller never reaches a tool.
 * Refusals are logged like any other call, so brute-force attempts show up in
 * `AdminApi_Call` instead of nowhere.
 *
 * One JSON-RPC message per request, and a bounded one: see `envelopeRefusal` for
 * why a batch is turned away, and `MAX_ENVELOPE_BYTES` below for the size.
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
  auditUnreachedToolCall,
  envelopeRefusal,
} from '$lib/server/adminApi/mcpServer';

/**
 * Largest envelope this endpoint reads.
 *
 * Deliberately far above anything this catalogue needs (its parameters are ids,
 * campus names and school years) and far below the 64 MB `BODY_SIZE_LIMIT` the
 * app runs with for image uploads. The body is read twice on this route, once
 * here off a clone and once by the transport, so a limit that suits a file
 * upload is the wrong one for a JSON-RPC message.
 *
 * A bound, not a guarantee: it reads the declared length, and a request that
 * declares none falls back to `BODY_SIZE_LIMIT`. The amplification worth closing
 * is the number of calls per envelope, and `envelopeRefusal` closes that one.
 */
const MAX_ENVELOPE_BYTES = 256 * 1024;

/** The body size the client declared, or 0 when it declared none. */
function declaredBytes(request: Request): number {
  const header = Number(request.headers.get('content-length'));
  return Number.isFinite(header) && header > 0 ? header : 0;
}

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

  // Two bounds on what this endpoint takes, both audited like any other call:
  // how big an envelope may be, settled off the declared length before a byte is
  // read, and how many messages it may carry, settled right after parsing and
  // before the protocol layer is built.
  if (declaredBytes(event.request) > MAX_ENVELOPE_BYTES) {
    await recordAdminApiCall({
      caller: auth.caller,
      operation: 'mcp_request',
      status: 413,
    });
    return json(
      {
        error: `Requête trop volumineuse (limite ${MAX_ENVELOPE_BYTES / 1024} Ko). Les opérations de cette API prennent des identifiants et des années scolaires, jamais un document.`,
      },
      { status: 413 },
    );
  }

  // Read off a clone, so the transport still receives an unread body. This
  // endpoint already logs what never reaches a tool (an unauthenticated request,
  // above); a tool call the protocol layer is about to refuse belongs to the
  // same job, and the SDK settles those before our handler could log them.
  const body = await readJson(event.request.clone());

  const refusal = envelopeRefusal(body);
  if (refusal) {
    await recordAdminApiCall({
      caller: auth.caller,
      operation: 'mcp_request',
      status: refusal.status,
    });
    return json({ error: refusal.message }, { status: refusal.status });
  }

  await auditUnreachedToolCall(body, credential);

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
