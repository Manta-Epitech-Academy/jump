/**
 * In-memory rate limiter for the email-OTP verify actions (talent + parent
 * login). Counts *failed* attempts by client IP; once MAX_ATTEMPTS land
 * inside a WINDOW_MS sliding window the IP is blocked until the oldest
 * recorded failure ages out. Successful sign-ins do not consume the budget,
 * so a stage_seconde cohort or sibling-household NAT cannot lock itself out
 * by simply logging in correctly. Expired entries are garbage-collected
 * every CLEANUP_INTERVAL_MS.
 *
 * CWE-307 mitigation; users include minors (RGPD).
 *
 * Scope: OTP verify only. Fastlogin routes deliberately skip this; their
 * HMAC-signed JWT is unguessable and verified before any DB hit, so an
 * IP-keyed bucket would only DoS legitimate cohorts opening a broadcast
 * from a shared NAT (a school's wifi, siblings at home).
 *
 * Two-step call pattern at every site:
 *
 *   1. `checkRateLimit(ip)` *before* attempting the OTP verify — this is a
 *      pure read of the current failure count, it does NOT itself record an
 *      attempt. Bail with 429 if `!allowed`.
 *   2. On a failed verify (bad code, exception from BetterAuth, anything
 *      that's not a clean sign-in), call `recordFailedAttempt(ip)` so the
 *      next request from the same IP moves closer to the limit. On success,
 *      record nothing.
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

/**
 * Pure read of the current failure count for `ip`. Does not record anything;
 * call {@link recordFailedAttempt} *after* a verify actually fails. Side
 * effect kept to expired-entry pruning so a long-stale record can't return
 * `!allowed` after every recorded failure has aged out.
 */
export function checkRateLimit(ip: string): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const record = attempts.get(ip);
  if (!record) return { allowed: true };

  const now = Date.now();
  record.timestamps = record.timestamps.filter((t) => now - t < WINDOW_MS);
  if (record.timestamps.length === 0) {
    attempts.delete(ip);
    return { allowed: true };
  }

  if (record.timestamps.length >= MAX_ATTEMPTS) {
    const oldest = record.timestamps[0]!;
    const retryAfterSeconds = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}

/**
 * Record a failed OTP verify from `ip`. Call from the failure branch of the
 * verify handler — not on success, and not before the verify runs.
 */
export function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record) {
    attempts.set(ip, { timestamps: [now] });
    return;
  }
  record.timestamps = record.timestamps.filter((t) => now - t < WINDOW_MS);
  record.timestamps.push(now);
}
