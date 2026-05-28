/**
 * In-memory rate limiter for the email-OTP verify actions (talent + parent
 * login). Tracks attempts by client IP; allows MAX_ATTEMPTS per WINDOW_MS
 * sliding window; expired entries are garbage-collected every CLEANUP_INTERVAL_MS.
 *
 * CWE-307 mitigation; users include minors (RGPD).
 *
 * Scope: OTP verify only. Fastlogin routes deliberately skip this; their
 * HMAC-signed JWT is unguessable and verified before any DB hit, so an
 * IP-keyed bucket would only DoS legitimate cohorts opening a broadcast
 * from a shared NAT (a school's wifi, siblings at home).
 *
 * Deploy contract:
 *
 *   1. Behind a reverse proxy, set ADDRESS_HEADER (and XFF_DEPTH if more
 *      than one hop) on the adapter-node process. Without it,
 *      getClientAddress() returns the proxy's TCP peer and every request
 *      shares one global bucket: one curious user trips the limit for
 *      everyone. See .env.example for the per-deploy guidance.
 *
 *      Caveat for future call sites: once ADDRESS_HEADER is set in prod,
 *      adapter-node THROWS on any request that doesn't carry that header.
 *      Today the only callers of getClientAddress() are the two OTP-verify
 *      form actions, both reachable only through the proxy. Adding a new
 *      getClientAddress() call from a route that can be hit directly
 *      (a Docker healthcheck on sveltekit, an in-container fetch, a
 *      cron-driven probe) would 500 in prod.
 *
 *   2. The Map lives in the process. A single-pod deployment (current
 *      docker-compose shape) means the configured budget IS the budget.
 *      Horizontal scaling would give each replica its own bucket, so the
 *      effective limit becomes MAX_ATTEMPTS x N replicas; move to a shared
 *      store (Redis, Postgres) before scaling out.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface AttemptRecord {
  timestamps: number[];
}

const attempts = new Map<string, AttemptRecord>();

// Auto-clean expired entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of attempts) {
    record.timestamps = record.timestamps.filter((t) => now - t < WINDOW_MS);
    if (record.timestamps.length === 0) {
      attempts.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

export function checkRateLimit(ip: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record) {
    attempts.set(ip, { timestamps: [now] });
    return { allowed: true };
  }

  // Prune timestamps outside the current window
  record.timestamps = record.timestamps.filter((t) => now - t < WINDOW_MS);

  if (record.timestamps.length >= MAX_ATTEMPTS) {
    const oldest = record.timestamps[0]!;
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  record.timestamps.push(now);
  return { allowed: true };
}
