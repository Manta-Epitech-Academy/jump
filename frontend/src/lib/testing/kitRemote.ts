/**
 * Kit's `$app/server`, for a test that runs a remote function outside a request.
 *
 * Kit's own `query` and `command` only run inside a request kit is serving, so
 * a test replaces the module with this one and calls the function a
 * `*.remote.ts` exports as a plain async function:
 *
 *   vi.mock('$app/server', () => import('#lib/testing/kitRemote.ts'));
 *   callAs({ talent });
 *   await submitFeedback({ eventId, formId, answers });
 *
 * What runs is Jump's own: `gatedQuery` / `gatedCommand`, the gate, the schema
 * and the function's body. Each declared function carries the `__` kit's module
 * registration reads, so a remote module loads as it does in the app.
 * Test-only: nothing in the application imports it.
 */

type Body = (raw: unknown) => unknown;

const request = { locals: {} as App.Locals };

function declare(type: 'query' | 'command') {
  return (_validate: unknown, body: Body) =>
    Object.assign((raw?: unknown) => body(raw), { __: { type } });
}

export const query = declare('query');
export const command = declare('command');
export const getRequestEvent = () => request;

/** Who the next remote call comes from: no session unless `over` names one. */
export function callAs(over: Partial<App.Locals>): void {
  request.locals = {
    user: null,
    session: null,
    staffProfile: null,
    talent: null,
    ...over,
  } as App.Locals;
}
