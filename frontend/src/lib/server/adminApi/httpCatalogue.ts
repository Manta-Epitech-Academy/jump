/**
 * Where each catalogue operation lives over HTTP, read off the route files.
 *
 * The catalogue names an operation and never its URL: the route file under
 * `src/routes/api/admin/` is where that is written, once, and the verb is the
 * export it hangs on. This reads both back, so the HTTP reference and the test
 * that every operation is mounted exactly once rest on the same answer rather
 * than on a second list of paths that could drift from the files.
 *
 * Only handlers built by `route.ts` count. The two admin-session endpoints that
 * sit under the same prefix (`people`, `events/[id]/participations`) are not
 * operations and have no business in a reference handed to a token holder.
 */
import { mountedOperationOf, type MountedOperation } from './route';

export type HttpOperation = MountedOperation & {
  method: 'GET' | 'POST';
  /** Absolute path, e.g. `/api/admin/write/workshop-instance`. */
  path: string;
};

const ROUTES_ROOT = '/src/routes';
const METHODS = ['GET', 'POST'] as const;

// Lazy, so a route module (the reference's own included) is only imported when
// somebody asks, never while this module is being evaluated.
const routeModules = import.meta.glob<Record<string, unknown>>(
  '/src/routes/api/admin/**/+server.ts',
);

/** `/src/routes/api/admin/write/workshop/+server.ts` → `/api/admin/write/workshop`. */
function pathOf(file: string): string {
  return file.slice(ROUTES_ROOT.length).replace(/\/\+server\.ts$/, '');
}

/**
 * Every mounted operation, sorted by path.
 *
 * Read afresh on every call rather than memoised: the module loader already
 * holds each route once imported, so a second read costs a walk over resolved
 * promises, and a memoised rejection would keep the reference down until the
 * pod restarts.
 */
export async function httpOperations(): Promise<HttpOperation[]> {
  const found: HttpOperation[] = [];
  for (const [file, importModule] of Object.entries(routeModules)) {
    const module = await importModule();
    for (const method of METHODS) {
      const operation = mountedOperationOf(module[method]);
      if (!operation) continue;
      const path = pathOf(file);
      if (path.includes('[')) {
        // An operation takes its params from the query string or the body, so
        // a path parameter would be a second way in that the catalogue's schema
        // does not see.
        throw new Error(
          `${operation.name} is mounted under a parameterised path (${path}).`,
        );
      }
      found.push({ ...operation, method, path });
    }
  }
  return found.sort((a, b) => a.path.localeCompare(b.path));
}
