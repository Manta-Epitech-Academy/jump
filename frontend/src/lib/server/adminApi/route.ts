/**
 * Turns a catalogue entry into a SvelteKit handler.
 *
 * Authentication, param validation and response shaping live here; authorising,
 * running and recording the call are `executeOperation`'s, shared with the MCP
 * consumer. Either way each endpoint file under `src/routes/api/admin/` stays one
 * line, and that is not just brevity: it makes the audit row structurally
 * unskippable. An endpoint cannot forget to log, because logging is not
 * something an endpoint does.
 *
 * Two entry points rather than one, because a read and a write differ in more
 * than a verb: the params arrive from different places (query string vs JSON
 * body) and a write also has a change to record. Each asserts the catalogue's
 * `kind` when the module is first imported, so mounting a write under `GET` is a
 * startup error rather than a surprise in production.
 */

import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { authenticateAdminApi } from './guard';
import { recordAdminApiCall } from './audit';
import { executeOperation } from './execute';
import {
  ADMIN_API_OPERATIONS,
  type AdminApiOperation,
  type AdminApiOperationName,
} from './operations';

/** Only the params the caller actually sent, so `.optional()` behaves. */
function queryObject(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (value !== '') out[key] = value;
  }
  return out;
}

/**
 * A JSON object body, or `{}` for an empty one (an operation whose params are
 * all optional is legitimately called with no body). Anything else is a caller
 * bug and is refused by the schema below, not swallowed here.
 */
async function bodyObject(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * What both handlers share on this transport: identify the caller, validate the
 * params, answer. Authorising, running and recording are `executeOperation`'s.
 * `readParams` is what differs between a read and a write.
 */
function handlerFor(
  name: AdminApiOperationName,
  operation: AdminApiOperation,
  readParams: (event: RequestEvent) => Promise<unknown>,
  /** How a served answer is encoded. Refusals are always JSON. */
  encode: (data: unknown) => Response = json,
): RequestHandler {
  return async (event) => {
    const auth = await authenticateAdminApi(event);
    if (!auth.ok) {
      await recordAdminApiCall({
        caller: auth.caller,
        operation: name,
        status: auth.status,
      });
      return json({ error: auth.message }, { status: auth.status });
    }

    // The catalogue's schema is strict: an unknown param is a caller bug (or a
    // probe for a filter we do not offer), never silently ignored. Refused here
    // rather than in `executeOperation`, because answering a malformed request
    // is transport-specific: this one can afford the machine-readable detail of
    // which param was wrong.
    const parsed = operation.schema.safeParse(await readParams(event));
    if (!parsed.success) {
      await recordAdminApiCall({
        caller: auth.caller,
        operation: name,
        status: 400,
      });
      return json(
        {
          error: 'Paramètres invalides.',
          details: z.treeifyError(parsed.error),
        },
        { status: 400 },
      );
    }

    const outcome = await executeOperation({
      name,
      operation,
      credential: auth,
      params: parsed.data,
    });
    return outcome.ok
      ? encode(outcome.data)
      : json({ error: outcome.message }, { status: outcome.status });
  };
}

function operationOfKind(
  name: AdminApiOperationName,
  kind: AdminApiOperation['kind'],
): AdminApiOperation {
  const operation = ADMIN_API_OPERATIONS[name];
  if (operation.kind !== kind) {
    // Thrown at import time, so the mistake surfaces when the app boots rather
    // than the first time somebody calls the endpoint.
    throw new Error(
      `Operation "${name}" is a ${operation.kind}; mount it with adminApi${
        operation.kind === 'read' ? 'Read' : 'Write'
      } instead.`,
    );
  }
  return operation;
}

/** Mount a read operation as `GET`. Params come from the query string. */
export function adminApiRead(name: AdminApiOperationName): RequestHandler {
  const operation = operationOfKind(name, 'read');
  return handlerFor(name, operation, async (event) => queryObject(event.url));
}

/**
 * Mount a read operation as `GET` that serves its image directly.
 *
 * For the answers whose point IS the artifact: a rendered certificate is looked
 * at, and a JSON envelope around base64 cannot be. Same authorisation, same
 * validation, same audit row as any other read - only the success encoding
 * differs, which is this transport's business and nobody else's.
 *
 * It matters more than convenience. An MCP client that cannot display an inline
 * image otherwise leaves a model with the source and a question it will answer
 * by describing the design, which is the one thing this tier forbids. A URL is
 * something it can hand over instead.
 */
export function adminApiImage(name: AdminApiOperationName): RequestHandler {
  const operation = operationOfKind(name, 'read');
  return handlerFor(
    name,
    operation,
    async (event) => queryObject(event.url),
    (data) => {
      const image = (data as { image?: { mimeType: string; base64: string } })
        .image;
      if (!image) {
        // The operation stopped carrying an image: a caller expecting a picture
        // must not receive a JSON body typed as one.
        return json(
          { error: `L'opération ${name} n'a pas renvoyé d'image.` },
          { status: 500 },
        );
      }
      return new Response(Buffer.from(image.base64, 'base64'), {
        headers: {
          'Content-Type': image.mimeType,
          // Rendered from the stored design on every call, so an edited design
          // is never served from a cache.
          'Cache-Control': 'no-store',
        },
      });
    },
  );
}

/** Mount a write operation as `POST`. Params come from the JSON body. */
export function adminApiWrite(name: AdminApiOperationName): RequestHandler {
  const operation = operationOfKind(name, 'write');
  return handlerFor(name, operation, (event) => bodyObject(event.request));
}
