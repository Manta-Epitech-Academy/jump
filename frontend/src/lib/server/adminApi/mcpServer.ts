/**
 * The MCP server exposing the curated admin operations as tools.
 *
 * One tool per catalogue entry, same names, same params, same French
 * descriptions: `ADMIN_API_OPERATIONS` is the single list, so an operation cannot
 * exist over HTTP but not over MCP, or carry two different descriptions.
 *
 * Tools call the operation's service function directly. Never HTTP-to-self: that
 * would double the request, lose the caller identity, and make the audit row lie
 * about who asked.
 *
 * The tool's `inputSchema` is the catalogue's own strict schema, not a raw shape.
 * Handing the SDK a shape let it build a default (stripping) object, so an
 * unknown or misspelled param was dropped in silence and the tool answered on a
 * wider scope than it was asked about; a strict schema refuses it, and the
 * `additionalProperties: false` it emits in `tools/list` tells the model so
 * up front.
 *
 * Built per request (see `routes/api/mcp/+server.ts`): the transport is stateless
 * so nothing survives between calls, which is what the horizontally-scaled pods
 * require. Constructing an `McpServer` is cheap object wiring, no I/O.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ADMIN_API_OPERATIONS } from './operations';
import { UnknownScopeError } from './scope';
import { recordAdminApiCall, type AdminApiCaller } from './audit';

export const MCP_SERVER_NAME = 'jump-admin';
export const MCP_SERVER_VERSION = '1.0.0';

/**
 * The standing instruction, declared once for the whole server instead of
 * restated in every tool description.
 *
 * This is the tier's first design rule in the one place a model is guaranteed to
 * read before calling anything: every figure arrives with its own French
 * definition, and the definition is the wording to reuse. Written in English
 * because it is instruction; the definitions it points at stay French because they
 * get quoted verbatim to a French-speaking admin.
 */
const MCP_INSTRUCTIONS = [
  'Curated read-only reporting for the Jump admin team. Every tool returns',
  'aggregates and configuration state; no talent name, email or phone exists in',
  'any answer, so do not offer to look a person up.',
  '',
  'Each figure comes back as { value, definition }, where the definition is a',
  'French sentence stating exactly what was counted. Quote values as they are and',
  'reuse those definitions verbatim when you explain a number. Do not re-derive,',
  'combine, extrapolate or convert figures, and do not translate a definition:',
  'they are written for the French-speaking staff who read your answer.',
  '',
  'A campus is named ("Lille"), never given as an id. If a campus, event or',
  'school year is refused, the refusal lists the values that exist: ask again with',
  'one of them rather than reporting zero.',
].join('\n');

export function buildAdminMcpServer(caller: AdminApiCaller): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { instructions: MCP_INSTRUCTIONS },
  );

  for (const [name, operation] of Object.entries(ADMIN_API_OPERATIONS)) {
    server.registerTool(
      name,
      { description: operation.description, inputSchema: operation.schema },
      async (args: Record<string, unknown>) => {
        try {
          const data = await operation.run(args);
          await recordAdminApiCall({
            caller,
            operation: name,
            params: args,
            status: 200,
          });
          // Text content, not structured output: every figure already travels
          // with its French definition inside the payload, and that is what we
          // want quoted back.
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(data, null, 2) },
            ],
          };
        } catch (err) {
          // A campus / event / school year nobody knows is answered with the
          // refusal itself, which names the values that would have worked: the
          // model can correct its own question. Anything else stays opaque.
          const scopeError = err instanceof UnknownScopeError;
          if (!scopeError) console.error(`[mcp] ${name} failed:`, err);
          await recordAdminApiCall({
            caller,
            operation: name,
            params: args,
            status: scopeError ? 400 : 500,
          });
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: scopeError
                  ? err.message
                  : `Erreur interne lors de l'exécution de ${name}.`,
              },
            ],
          };
        }
      },
    );
  }

  return server;
}
