/**
 * Running one curated operation: authorise, run, record, classify. Shared by both
 * consumers, so an answer and its audit row cannot differ depending on whether
 * the question arrived over HTTP or over MCP.
 *
 * This used to be written twice, once in `route.ts` and once in `mcpServer.ts`,
 * and the two copies had already drifted: the MCP one logged the call but not
 * the refusals the protocol layer produced before it. Duplicating "and then log
 * it" is how a log ends up telling half the story, so the step lives here and
 * each consumer keeps only what is genuinely its own: where the params come from
 * (query string, JSON body, tool arguments) and how an answer is shaped
 * (a `Response`, a `CallToolResult`).
 *
 * Params arrive already validated against the operation's own schema. That check
 * stays with the consumer because only it knows how to answer a malformed
 * request, and because the MCP SDK performs it itself before a tool handler is
 * reached (see `auditUnreachedToolCall`).
 */

import { authorizeOperation, type AdminApiCredential } from './guard';
import { recordAdminApiCall, type AdminApiCallParams } from './audit';
import { callerFacingError } from './errors';
import { auditChangeOf } from './plan';
import type { AdminApiOperation, AdminApiOperationName } from './operations';

/**
 * What came of a call. Discriminated rather than thrown: both consumers have to
 * answer *something*, and a refusal is a normal outcome of this tier, not an
 * exception.
 *
 * `status` is the HTTP status the refusal would carry. MCP has no status codes,
 * but the audit log does, and one vocabulary for both is what lets
 * `ops_api_usage` count refusals across transports.
 */
export type OperationOutcome =
  | { ok: true; data: unknown }
  | { ok: false; status: number; message: string };

/**
 * Authorise this credential for this operation, run it, and record the call
 * whatever happens: served, refused or failed.
 */
export async function executeOperation(input: {
  name: AdminApiOperationName;
  operation: AdminApiOperation;
  credential: AdminApiCredential;
  /** Validated against `input.operation.schema` by the caller. */
  params: AdminApiCallParams;
}): Promise<OperationOutcome> {
  const { name, operation, credential, params } = input;
  const { caller } = credential;

  const allowed = await authorizeOperation(credential, operation);
  if (!allowed.ok) {
    await recordAdminApiCall({
      caller,
      operation: name,
      params,
      status: allowed.status,
    });
    return { ok: false, status: allowed.status, message: allowed.message };
  }

  try {
    const data = await operation.run(params, {
      tier: caller.tier,
      actorUserId: caller.actorUserId,
    });
    await recordAdminApiCall({
      caller,
      operation: name,
      params,
      status: 200,
      change: auditChangeOf(operation.kind, data),
    });
    return { ok: true, data };
  } catch (err) {
    // A caller error answers with its own message, which names what to do
    // instead (the campus that exists, the form that does, the fresh plan
    // digest). Anything else is ours: opaque to the caller, loud in the pod logs.
    const refusal = callerFacingError(err);
    if (!refusal) console.error(`[adminApi] ${name} failed:`, err);
    const status = refusal?.status ?? 500;
    await recordAdminApiCall({ caller, operation: name, params, status });
    return {
      ok: false,
      status,
      message: refusal?.message ?? `Erreur interne (${name}).`,
    };
  }
}
