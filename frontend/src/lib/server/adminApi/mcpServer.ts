/**
 * The MCP server exposing the curated admin operations as tools.
 *
 * One tool per catalogue entry the caller may actually run, same names, same
 * params, same answers: `ADMIN_API_OPERATIONS` is the single list, so an
 * operation cannot exist over HTTP but not over MCP, or carry two different
 * descriptions.
 *
 * The tool list is built for the credential, not for the server. A leadership
 * token gets the pilot figures and nothing else; a read-only token gets no write
 * tool. That is not the security boundary (the guard is, and it runs again on
 * every call below) - it is what stops a model from trying in the first place.
 * A tool a model can see is a tool it will eventually reach for, and a refusal
 * it did not expect is worse than an absence it never noticed.
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
import {
  ADMIN_API_OPERATIONS,
  operationsOfferedTo,
  type AdminApiOperationName,
  type AdminApiTier,
} from './operations';
import { recordAdminApiCall, type AdminApiCallParams } from './audit';
import { executeOperation } from './execute';
import { type AdminApiCredential } from './guard';

export const MCP_SERVER_NAME = 'jump-admin';
export const MCP_SERVER_VERSION = '2.0.0';

/**
 * The standing instructions, declared once for the whole server instead of
 * restated in every tool description.
 *
 * This is the tier's first design rule in the one place a model is guaranteed to
 * read before calling anything: every figure arrives with its own French
 * definition, and the definition is the wording to reuse. Written in English
 * because it is instruction; the definitions it points at stay French because
 * they get quoted verbatim to a French-speaking reader.
 *
 * Composed from the credential rather than fixed, because the two tiers are
 * genuinely told different things: what a leadership client must not do (expect
 * per-person detail) is not what a core client must not do (fire a bulk apply
 * without a dry run).
 */
const SHARED_INSTRUCTIONS = [
  'Each figure comes back as { value, definition }, where the definition is a',
  'French sentence stating exactly what was counted. Quote values as they are and',
  'reuse those definitions verbatim when you explain a number. Do not re-derive,',
  'combine, extrapolate or convert figures, and do not translate a definition:',
  'they are written for the French-speaking staff who read your answer.',
  '',
  'That extends to anything you might be tempted to work out yourself. A share, a',
  'ranking and a year-on-year movement are figures these tools return already',
  'computed: rank nothing, subtract nothing, and if the comparison you need is not',
  'in an answer, look for the tool that returns it rather than doing the',
  'arithmetic.',
  '',
  'Some answers carry verbatim, unattributed quotes written by students about an',
  'event; quote them as they are, never edit them, and never guess who said one.',
  '',
  'A campus is named ("Lille"), never given as an id. If a campus, event or',
  'school year is refused, the refusal lists the values that exist: ask again with',
  'one of them rather than reporting zero. meta_scope lists them up front, so',
  'prefer calling it over guessing a name.',
];

const CORE_INSTRUCTIONS = [
  'Curated reporting and configuration for the Jump admin team. No talent name,',
  'email or phone exists in any answer, so do not offer to look a person up.',
  '',
  ...SHARED_INSTRUCTIONS,
  '',
  'Tools whose name starts with write_ or bulk_ change data. Every one of them is',
  'logged with what it changed, each states in its description whether repeating',
  'it is safe, and each answers with the resulting state: report that state rather',
  'than asserting success. A bulk_ tool must first be called without planDigest to',
  'obtain a plan; show that plan to the human, and only then call it again with',
  'the digest it returned.',
];

const LEADERSHIP_INSTRUCTIONS = [
  'Curated steering figures for Epitech leadership, read-only. Every answer is an',
  'aggregate or a ranking over the Jump platform (open days, coding clubs, stages',
  'de seconde). There is no per-person data of any kind here, and no way to reach',
  'any: do not offer to look up a student, a school contact or a staff member.',
  '',
  ...SHARED_INSTRUCTIONS,
  '',
  'Every answer carries "fraicheur", the age of the data it was computed on. Read',
  'it before you quote anything: when its "stale" field is true, the figures',
  'describe the platform as of that timestamp, and say so alongside them. It is',
  'null when no synchronisation was ever recorded, in which case nothing',
  'guarantees the figures are current.',
  '',
  'Jump records who attended and what they said, never whether they later enrolled',
  'at Epitech. Do not present any figure here as a conversion or admission rate.',
];

/**
 * The standing instructions for a tier, as the server declares them.
 *
 * Exported so the rules that only exist as prose can be asserted: they are the
 * one place a model is guaranteed to read, and nothing fails at runtime when one
 * of them is dropped in an edit.
 */
export function adminMcpInstructions(tier: AdminApiTier): string {
  return (
    tier === 'leadership' ? LEADERSHIP_INSTRUCTIONS : CORE_INSTRUCTIONS
  ).join('\n');
}

export function buildAdminMcpServer(credential: AdminApiCredential): McpServer {
  const { caller, writeEnabled } = credential;

  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { instructions: adminMcpInstructions(caller.tier) },
  );

  for (const [name, operation] of operationsOfferedTo({
    tier: caller.tier,
    writeEnabled,
  })) {
    server.registerTool(
      name,
      { description: operation.description, inputSchema: operation.schema },
      // Authorisation (re-checked per call, because a quota is spent as the
      // session goes and a token revoked mid-conversation must stop working),
      // the run and the audit row are the shared step; only the answer's shape
      // is this transport's business. A refusal is answered with its own
      // message: it names the values, or the fresh plan digest, that would have
      // worked, so the model can correct its own question.
      async (args: Record<string, unknown>) => {
        const outcome = await executeOperation({
          name,
          operation,
          credential,
          params: args,
        });
        // Text content, not structured output: every figure already travels
        // with its French definition inside the payload, and that is what we
        // want quoted back.
        return outcome.ok
          ? {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(outcome.data, null, 2),
                },
              ],
            }
          : {
              isError: true,
              content: [{ type: 'text' as const, text: outcome.message }],
            };
      },
    );
  }

  return server;
}

/** Longest tool name kept in the log, so an invented one cannot bloat a row. */
const MAX_LOGGED_NAME = 100;

/** One `tools/call` as it arrives on the wire, before anything validates it. */
type ToolCall = { name: string; args: AdminApiCallParams };

/**
 * Record the tool calls that never reach a tool.
 *
 * The SDK refuses an unknown tool name, and validates arguments against the
 * tool's schema, before the handler registered above runs. That is correct
 * protocol behaviour and incomplete audit behaviour: those two refusals are
 * precisely the ones worth seeing in the log (a model reaching for an operation
 * it invented, or probing a filter this tier does not offer), the same request
 * over HTTP logs them as a 400, and `ops_api_usage` counts refusals as the
 * friction signal it reports. Left alone, the one path a language model actually
 * uses is the one path that under-reports.
 *
 * So the endpoint hands the raw envelope here first. This reads it and never
 * answers it: the transport still produces the response, and the decision of
 * what is refused is delegated to the same catalogue and the same schema the SDK
 * is about to consult, so the two cannot disagree.
 *
 * Silent when the call will reach its tool: the handler logs that one itself,
 * with its outcome.
 */
export async function auditUnreachedToolCalls(
  body: unknown,
  credential: AdminApiCredential,
): Promise<void> {
  const calls = toolCallsIn(body);
  if (calls.length === 0) return;

  const offered = new Set<string>(
    operationsOfferedTo({
      tier: credential.caller.tier,
      writeEnabled: credential.writeEnabled,
    }).map(([name]) => name),
  );

  for (const call of calls) {
    const status = refusalAheadOf(call, offered);
    if (!status) continue;
    // The operation and the status, never the arguments. Nothing validated them,
    // so they are whatever the client sent: a model asked to find a student can
    // put that student's name in a parameter this tier does not have, and
    // `AdminApi_Call.params` holds validated params precisely so it cannot become
    // the one place a name is kept. The same reason `route.ts` logs a 400 without
    // them, and the tool name is the signal worth having anyway.
    await recordAdminApiCall({
      caller: credential.caller,
      operation: call.name.slice(0, MAX_LOGGED_NAME),
      status,
    });
  }
}

/**
 * The status the protocol layer is about to answer with, or null when the call
 * will reach its tool. Deliberately does not consult the quotas: those are
 * settled by `executeOperation` inside the handler, and asking here would double
 * every counting query on the calls that succeed.
 */
function refusalAheadOf(
  call: ToolCall,
  offered: ReadonlySet<string>,
): 400 | 403 | 404 | null {
  const operation = ADMIN_API_OPERATIONS[call.name as AdminApiOperationName];
  // Not in the catalogue at all: an invented tool.
  if (!operation) return 404;
  // Real, but not registered for this credential (tier, or write capability),
  // so the SDK answers "not found" where the truth is "not for you".
  if (!offered.has(call.name)) return 403;
  return operation.schema.safeParse(call.args).success ? null : 400;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The `tools/call` requests in a JSON-RPC envelope, which may be a single
 * request or a batch. Anything malformed is left to the transport to reject:
 * with no tool name there is nothing to attribute a row to.
 */
function toolCallsIn(body: unknown): ToolCall[] {
  const entries = Array.isArray(body) ? body : [body];
  return entries.flatMap<ToolCall>((entry) => {
    if (!isRecord(entry) || entry.method !== 'tools/call') return [];
    const params = isRecord(entry.params) ? entry.params : {};
    if (typeof params.name !== 'string' || !params.name) return [];
    return [
      {
        name: params.name,
        args: isRecord(params.arguments) ? params.arguments : {},
      },
    ];
  });
}
