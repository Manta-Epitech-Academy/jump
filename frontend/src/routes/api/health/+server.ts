import type { RequestHandler } from './$types';
import { checkReadiness } from '#lib/server/infra/health.ts';

/**
 * The route the hosting team's probes and monitoring call: 200 when this pod
 * can serve, 503 when it cannot. What "can serve" means, and why a liveness
 * probe must not use it, is in `checkReadiness`.
 *
 * Unauthenticated on purpose, like any probe target, so the answer carries
 * nothing a stranger could use: no version, no dependency, no reason. It
 * passes through `hooks.server.ts` like every request and costs it nothing
 * there: a probe sends no cookie, so no session is read, the guards leave
 * `/api/*` to the routes, and no usage is recorded for it.
 *
 * `no-store`, so no cache between the probe and the pod can answer for it.
 * HEAD is served from this handler by SvelteKit.
 */
export const GET: RequestHandler = async () => {
  const { ready } = await checkReadiness();
  return Response.json(
    { status: ready ? 'ok' : 'unavailable' },
    {
      status: ready ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
};
