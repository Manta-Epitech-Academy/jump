/**
 * In-memory rate limiter for OTP login (talent + parent). Keyed on the *email*
 * under attack, not on the requester's IP — the credential is what an attacker
 * is brute-forcing or mail-bombing, and per-IP keying punishes 199 innocent
 * neighbours when a stage_seconde cohort shares a school's NAT. Email keying
 * naturally tolerates cohorts (200 students = 200 separate buckets) AND catches
 * the real attack shape (one email sprayed from many IPs).
 *
 * CWE-307 / CWE-799 mitigation; users include minors (RGPD).
 *
 * Two buckets per email, distinct threat models:
 *
 *   - `request`: caps OTP **send** calls (mailbomb + Resend cost). 3 per 10min
 *     means the worst case for one mailbox is 18 messages per hour.
 *   - `verify`: caps **failed** OTP verifies (code brute-force). 5 per 10min
 *     keeps the 10^6 keyspace at ~380 years to exhaust for one email.
 *
 * A combined bucket would have to pick a wonky shared cap that punishes neither
 * threat well; the two are kept separate for that reason.
 *
 * Call pattern (both endpoints, both routes):
 *
 *   1. `checkRateLimit(bucket, email)` BEFORE the work — pure read of the
 *      current count, also prunes aged-out entries. Bail with 429 if blocked.
 *   2. Run the work. `recordAttempt(bucket, email)` only when the attempt was
 *      "real":
 *        - `request`: after the OTP was actually sent (no record on lookup-404
 *          or provider error; only successful sends cost real money / fill
 *          mailboxes).
 *        - `verify`: in the catch branch of the verify call (clean sign-ins
 *          don't consume budget — same reason as the cohort case).
 *
 * Deploy notes:
 *
 *   - **Single source of truth for the OTP path.** BetterAuth's emailOTP plugin
 *     ships its own per-IP limiter (3 req / 60s on `/sign-in/email-otp` by
 *     default), which would lock out 197 of 200 cohort members regardless of
 *     anything we do here. `auth.ts` relaxes that override (`rateLimit: { max:
 *     100, window: 60 }`) so this module owns OTP policy.
 *   - **Map lives in the process.** Single-pod deploy (current docker-compose
 *     shape) means the configured budget IS the budget. Horizontal scaling
 *     would give each replica its own bucket, so the effective limit becomes
 *     max x N replicas; move to a shared store (Redis, Postgres) before
 *     scaling out.
 */

export type OtpAttemptBucket = 'request' | 'verify';

interface BucketConfig {
  max: number;
  windowMs: number;
}

const BUCKETS: Record<OtpAttemptBucket, BucketConfig> = {
  request: { max: 3, windowMs: 10 * 60 * 1000 },
  verify: { max: 5, windowMs: 10 * 60 * 1000 },
};

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Key shape: `${bucket}:${normalizedEmail}`. Composite is simpler than nesting
// and keeps cleanup a single pass over one map.
const attempts = new Map<string, number[]>();

function normalize(email: string): string {
  return email.toLowerCase().trim();
}

function keyFor(bucket: OtpAttemptBucket, email: string): string {
  return `${bucket}:${normalize(email)}`;
}

function windowOf(key: string): number | null {
  const bucket = key.split(':', 1)[0] as OtpAttemptBucket;
  return BUCKETS[bucket]?.windowMs ?? null;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of attempts) {
    const window = windowOf(key);
    if (window === null) {
      attempts.delete(key);
      continue;
    }
    const fresh = timestamps.filter((t) => now - t < window);
    if (fresh.length === 0) attempts.delete(key);
    else if (fresh.length !== timestamps.length) attempts.set(key, fresh);
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Pure read of the current attempt count for `(bucket, email)`. Prunes
 * aged-out entries so a long-stale record can't return `!allowed` after every
 * recorded attempt has expired. Does not itself record an attempt — call
 * {@link recordAttempt} after a real one.
 */
export function checkRateLimit(
  bucket: OtpAttemptBucket,
  email: string,
): { allowed: boolean; retryAfterSeconds?: number } {
  const { max, windowMs } = BUCKETS[bucket];
  const key = keyFor(bucket, email);
  const timestamps = attempts.get(key);
  if (!timestamps) return { allowed: true };

  const now = Date.now();
  const fresh = timestamps.filter((t) => now - t < windowMs);
  if (fresh.length === 0) {
    attempts.delete(key);
    return { allowed: true };
  }
  if (fresh.length !== timestamps.length) attempts.set(key, fresh);

  if (fresh.length >= max) {
    const oldest = fresh[0]!;
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((oldest + windowMs - now) / 1000),
    };
  }
  return { allowed: true };
}

/**
 * Record one attempt against `(bucket, email)`. Call from the appropriate
 * branch of the handler (see file-level doc): post-send for `request`, catch
 * branch for `verify`.
 */
export function recordAttempt(bucket: OtpAttemptBucket, email: string): void {
  const { windowMs } = BUCKETS[bucket];
  const key = keyFor(bucket, email);
  const now = Date.now();
  const timestamps = attempts.get(key);
  if (!timestamps) {
    attempts.set(key, [now]);
    return;
  }
  const fresh = timestamps.filter((t) => now - t < windowMs);
  fresh.push(now);
  attempts.set(key, fresh);
}
