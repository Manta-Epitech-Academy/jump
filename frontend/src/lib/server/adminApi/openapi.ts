/**
 * The HTTP transport's own description of itself: an OpenAPI 3.1 document
 * listing what one credential can call, generated on every request.
 *
 * It is the HTTP twin of MCP's `tools/list`, and that is the line it stays on.
 * An MCP client discovers the catalogue through its transport; an HTTP caller
 * had nothing, so the API was only reachable by somebody who already knew the
 * paths. That is discovery the transport did NOT already do, which is what
 * separates it from the retired `meta_operations` (a catalogue operation that
 * re-served `tools/list` to clients who had it). It is therefore not an
 * operation either: nothing here is a figure, and nothing lands in the tool list.
 *
 * Generated rather than written, so it cannot drift: the operations, their
 * descriptions and their schemas come from `operations.ts`, the paths and verbs
 * from the route files (`httpCatalogue.ts`). The schemas go through the same
 * `z.toJSONSchema` in `input` mode the MCP SDK uses, targeting the JSON Schema
 * dialect OpenAPI 3.1 is written in.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { authenticateOrRefuse } from './guard';
import { recordAdminApiCall, TRANSPORT_OPERATIONS } from './audit';
import { httpOperations } from './httpCatalogue';
import {
  isOperationAllowedForCapability,
  operationsForTier,
  operationsOfferedTo,
  type AdminApiOperation,
  type AdminApiTier,
} from './operations';

type JsonSchema = Record<string, unknown>;

/**
 * How every operation of this API behaves, for a human reading the reference:
 * what the document lists depends on whether it documents one token or both
 * kinds of the tier's tokens, which is the admin reference page.
 */
const apiDescription = (bothKinds: boolean) =>
  [
    'The curated administration API of Jump: named operations, the same ones the',
    'MCP endpoint (/api/mcp) serves as tools. This document lists the ones',
    bothKinds
      ? 'a token of this tier can call, read-only or allowed to write, each saying which of the two it needs when only one is offered it.'
      : 'your token can call.',
    'It is generated from the catalogue on every request.',
    '',
    'Authenticate every call with `Authorization: Bearer <token>`. Tokens are',
    'minted by an admin on /staff/admin/api-tokens. A read-only token is offered',
    'no write, a token allowed to write no read returning text a talent typed,',
    'and a leadership token the steering figures only.',
    '',
    'A read is a GET taking its parameters from the query string. A write is a POST',
    'taking a JSON object body, and answers with the state before and after it.',
    'Unknown parameters are refused rather than ignored.',
    '',
    'Some writes replace a whole structure and take a `planDigest`. Call them',
    'first without it: nothing changes and the answer is the plan with its digest.',
    'Call again with that digest to apply; a 409 means the data moved in between,',
    'so read the new plan and confirm again.',
    '',
    'A refusal is `{ "error": "..." }`, in French, with the status that says why;',
    'an invalid parameter (400) also carries `details`. Every call, refused or not,',
    'is recorded with the token that made it, and a write with what it changed.',
  ].join('\n');

/** Each operation, grouped by the first segment of its path. */
const TAGS: Record<string, string> = {
  config: 'Configuration state',
  stats: 'Figures',
  ops: 'Operational queues and actions',
  write: 'Writes',
  bulk: 'Bulk writes',
  scope: 'Discovery',
};

const ERROR_RESPONSES = {
  '400': { $ref: '#/components/responses/Refused' },
  '401': { $ref: '#/components/responses/Unauthenticated' },
  '403': { $ref: '#/components/responses/Forbidden' },
  '500': { $ref: '#/components/responses/Failed' },
};

const DEFS_PREFIX = '#/$defs/';
const COMPONENTS_PREFIX = '#/components/schemas/';

/**
 * A named sub-schema (`.meta({ id })`) is emitted in `$defs` by the converter,
 * whose `#/$defs/...` references only resolve inside that one schema. Lift them
 * into the document's components and point the references there.
 */
function liftDefinitions(
  schema: JsonSchema,
  components: Record<string, JsonSchema>,
): JsonSchema {
  const {
    $defs,
    $schema: _,
    ...rest
  } = schema as JsonSchema & {
    $defs?: Record<string, JsonSchema>;
  };
  const relink = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(relink);
    if (node === null || typeof node !== 'object') return node;
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        key === '$ref' &&
        typeof value === 'string' &&
        value.startsWith(DEFS_PREFIX)
          ? COMPONENTS_PREFIX + value.slice(DEFS_PREFIX.length)
          : relink(value),
      ]),
    );
  };
  for (const [id, definition] of Object.entries($defs ?? {})) {
    components[id] = relink(definition) as JsonSchema;
  }
  return relink(rest) as JsonSchema;
}

function inputSchema(
  operation: AdminApiOperation,
  components: Record<string, JsonSchema>,
): JsonSchema {
  return liftDefinitions(
    z.toJSONSchema(operation.schema, {
      io: 'input',
      target: 'draft-2020-12',
    }) as JsonSchema,
    components,
  );
}

/** A read's params, one query parameter per property of its schema. */
function queryParameters(schema: JsonSchema) {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((schema.required ?? []) as string[]);
  return Object.entries(properties).map(([name, property]) => {
    const { description, ...propertySchema } = property;
    return {
      name,
      in: 'query',
      required: required.has(name),
      ...(typeof description === 'string' ? { description } : {}),
      schema: propertySchema,
    };
  });
}

/**
 * Why a token of the tier, with or without the write capability, may be
 * refused an operation: the sentence the reference adds when it documents
 * both kinds of token at once. Null when either kind is offered it.
 */
function capabilityNote(operation: AdminApiOperation): string | null {
  if (!isOperationAllowedForCapability(operation, false))
    return 'Needs a token allowed to write.';
  if (!isOperationAllowedForCapability(operation, true))
    return 'Not offered to a token allowed to write, since the answer carries text a talent typed, verbatim: call it with a read-only token.';
  return null;
}

/**
 * The reference for one credential: only what it is offered, the rule MCP's
 * tool list follows, so a read-only token is never shown a write it would only
 * ever be refused.
 *
 * `writeEnabled: 'either'` documents the tier's tokens with and without the
 * write capability together, each operation saying which of the two it needs
 * when only one is offered it. That is the admin reference page: somebody
 * looks a call up there before minting the token for it, so it has to show the
 * writes a read-only token is not offered and the verbatim reads a token that
 * writes is not.
 */
export async function buildOpenApiDocument(credential: {
  tier: AdminApiTier;
  writeEnabled: boolean | 'either';
  origin: string;
}) {
  const { tier, writeEnabled } = credential;
  const offered = new Map(
    writeEnabled === 'either'
      ? operationsForTier(tier)
      : operationsOfferedTo({ tier, writeEnabled }),
  );
  const components: Record<string, JsonSchema> = {};
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of await httpOperations()) {
    const operation = offered.get(route.name);
    if (!operation) continue;
    const schema = inputSchema(operation, components);
    const group = route.path.split('/')[3];
    const success =
      route.encoding === 'image'
        ? {
            description: 'The rendered image.',
            content: { 'image/*': { schema: {} } },
          }
        : {
            description:
              operation.kind === 'write'
                ? 'The state before and after the write, or the plan of a two-step write called without its digest.'
                : 'The answer, each figure carrying its French definition.',
            content: { 'application/json': { schema: {} } },
          };

    paths[route.path] = {
      [route.method.toLowerCase()]: {
        operationId: route.name,
        summary: route.name,
        description: [
          operation.description,
          writeEnabled === 'either' ? capabilityNote(operation) : null,
        ]
          .filter(Boolean)
          .join(' '),
        tags: [TAGS[group] ?? group],
        ...(route.method === 'GET'
          ? { parameters: queryParameters(schema) }
          : {
              requestBody: {
                // `route.ts` reads an empty body as `{}`, so a write whose
                // params are all optional is legitimately called without one.
                required: ((schema.required ?? []) as string[]).length > 0,
                content: { 'application/json': { schema } },
              },
            }),
        responses: {
          '200': success,
          ...ERROR_RESPONSES,
          ...(operation.twoStep
            ? { '409': { $ref: '#/components/responses/StalePlan' } }
            : {}),
        },
      },
    };
  }

  const refusal = (description: string) => ({
    description,
    content: {
      'application/json': { schema: { $ref: '#/components/schemas/Error' } },
    },
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'Jump administration API',
      version: '1',
      description: apiDescription(writeEnabled === 'either'),
    },
    servers: [{ url: credential.origin }],
    security: [{ bearer: [] }],
    tags: [...new Set(Object.values(TAGS))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      schemas: {
        ...components,
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string', description: 'Why, in French.' },
            details: {
              type: 'object',
              description: 'Which parameter was invalid, on a 400 only.',
            },
          },
        },
      },
      responses: {
        Refused: refusal('An invalid parameter, or a refusal that says why.'),
        Unauthenticated: refusal('No token, or a token unknown or revoked.'),
        Forbidden: refusal('The token cannot call this operation.'),
        StalePlan: refusal(
          'The data moved since the plan was read: read the new plan.',
        ),
        Failed: refusal('Jump failed to answer.'),
      },
    },
  };
}

/** `GET /api/admin/openapi.json`, authenticated and recorded like any call. */
export const serveOpenApiDocument: RequestHandler = async (event) => {
  const credential = await authenticateOrRefuse(
    event,
    TRANSPORT_OPERATIONS.openapi,
  );
  if (credential instanceof Response) return credential;

  // A failure is ours, so it is recorded as one, as `executeOperation` records
  // an operation's: an unrecorded 500 would read in `ops_api_usage` as no call.
  try {
    const document = await buildOpenApiDocument({
      tier: credential.caller.tier,
      writeEnabled: credential.writeEnabled,
      origin: event.url.origin,
    });
    await recordAdminApiCall({
      caller: credential.caller,
      operation: TRANSPORT_OPERATIONS.openapi,
      status: 200,
    });
    return json(document);
  } catch (err) {
    console.error('[adminApi] openapi document failed:', err);
    await recordAdminApiCall({
      caller: credential.caller,
      operation: TRANSPORT_OPERATIONS.openapi,
      status: 500,
    });
    return json(
      { error: `Erreur interne (${TRANSPORT_OPERATIONS.openapi}).` },
      { status: 500 },
    );
  }
};
