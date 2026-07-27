/**
 * Turns a catalogue entry into a SvelteKit `GET` handler.
 *
 * Authentication, param validation, the audit row and the error shaping all live
 * here, so each endpoint file under `src/routes/api/admin/` is one line. That is
 * not just brevity: it makes the audit row structurally unskippable. An endpoint
 * cannot forget to log, because logging is not something an endpoint does.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { authenticateAdminApi } from './guard';
import { recordAdminApiCall } from './audit';
import { UnknownScopeError } from './scope';
import { ADMIN_API_OPERATIONS, type AdminApiOperationName } from './operations';

/** Only the params the caller actually sent, so `.optional()` behaves. */
function queryObject(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (value !== '') out[key] = value;
  }
  return out;
}

export function adminApiRoute(name: AdminApiOperationName): RequestHandler {
  const operation = ADMIN_API_OPERATIONS[name];

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

    // The catalogue's schema is strict: an unknown query param is a caller bug
    // (or a probe for a filter we do not offer), never silently ignored.
    const parsed = operation.schema.safeParse(queryObject(event.url));
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

    try {
      const data = await operation.run(parsed.data);
      await recordAdminApiCall({
        caller: auth.caller,
        operation: name,
        params: parsed.data,
        status: 200,
      });
      return json(data);
    } catch (err) {
      // A scope nobody knows is a caller mistake, not a fault: answer 400 with
      // the message naming the values that would have worked, never zeros.
      const status = err instanceof UnknownScopeError ? 400 : 500;
      if (status === 500) console.error(`[adminApi] ${name} failed:`, err);
      await recordAdminApiCall({
        caller: auth.caller,
        operation: name,
        params: parsed.data,
        status,
      });
      return json(
        {
          error:
            err instanceof UnknownScopeError ? err.message : 'Erreur interne.',
        },
        { status },
      );
    }
  };
}
