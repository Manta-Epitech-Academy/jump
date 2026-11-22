import { prisma } from '#lib/server/db.ts';

/**
 * Whether this pod can serve a request, for the probes and the monitoring of
 * whoever hosts Jump (`GET /api/health`).
 *
 * READINESS, NOT LIVENESS, and the difference is the whole design. Every page
 * Jump renders reads Postgres, so a pod that cannot reach it has nothing to
 * serve and should leave the load balancer: that is what this answers, and why
 * it pings the database. A liveness probe must not call it. A database outage
 * would then fail every pod's liveness at once and the orchestrator would
 * restart all of them, turning an incident it cannot fix into a crash loop on
 * top of it. Liveness stays a TCP check on the port, as the k3s manifests
 * already do.
 *
 * The ping is bounded. A database that hangs rather than refuses would
 * otherwise hold the probe until the orchestrator's own timeout, and the pod
 * would be reported as a probe timeout rather than as not ready.
 *
 * Nothing about the failure leaves the pod. The answer is a boolean; the reason
 * goes to the log, where whoever reads it can already see the infrastructure.
 */
export const READINESS_TIMEOUT_MS = 2_000;

export type Readiness = { ready: boolean };

export async function checkReadiness(
  timeoutMs: number = READINESS_TIMEOUT_MS,
): Promise<Readiness> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`database ping exceeded ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  try {
    await Promise.race([prisma.$queryRaw`SELECT 1`, deadline]);
    return { ready: true };
  } catch (err) {
    console.error(
      '[health] not ready:',
      err instanceof Error ? err.message : String(err),
    );
    return { ready: false };
  } finally {
    clearTimeout(timer);
  }
}
