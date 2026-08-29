/**
 * Postgres-backed rate limiter for OTP login (talent + parent). Keyed on the
 * *email* under attack, not on the requester's IP: the credential is what an
 * attacker brute-forces or mail-bombs, and per-IP keying punishes 199 innocent
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
 * Storage shape follows CLAUDE.md's "facts as rows, state as projection"
 * pattern (cf. `XpGrant`, `MinigameAttempt`): the `OtpAttempt` table is the
 * append-only ledger, and the bucket's "current attempt count" is the projection
 * computed fresh on every check. No mutable counter, no in-process state.
 *
 * Call pattern (both endpoints, both routes):
 *
 *   1. `await checkRateLimit(bucket, email)` BEFORE the work: pure read of the
 *      current count, no row written. Bail with 429 if blocked.
 *   2. Run the work. `await recordAttempt(bucket, email)` only when the attempt
 *      was "real":
 *        - `request`: after the OTP was actually sent (no record on lookup-404
 *          or provider error; only successful sends cost real money / fill
 *          mailboxes).
 *        - `verify`: in the catch branch of the verify call (clean sign-ins
 *          don't consume budget, same reason as the cohort case).
 *
 * Deploy notes:
 *
 *   - **Single source of truth for the OTP path.** BetterAuth's emailOTP plugin
 *     ships its own per-IP limiter (3 req / 60s on `/sign-in/email-otp` by
 *     default), which would lock out 197 of 200 cohort members regardless of
 *     anything we do here. `auth.ts` relaxes that override (`rateLimit: { max:
 *     100, window: 60 }`) so this module owns OTP policy.
 *   - **Cluster-safe.** The ledger is in Postgres, so any number of SvelteKit
 *     replicas share one budget per email. A pod restart doesn't reset
 *     counters (the in-memory predecessor did, which was a soft hole an
 *     attacker could exploit by triggering restarts).
 *   - **Cluster cleanup** is the cron sweep at `POST /api/jobs/sweep-otp-attempts`
 *     (hourly is plenty: at ~1k attempts/day with 10-min windows, the table
 *     peaks at ~50 stale rows between sweeps). Module-level timers would
 *     race across pods, so cleanup is centralised in the cron, not in-process.
 *   - **Race window.** Two pods checking concurrently can each read `count = 4`,
 *     each `create` a row, and the next check sees 6: the cap over-allows by
 *     at most 1 attempt. Irrelevant at a 5-cap, so no transaction or
 *     advisory-lock dance is warranted.
 *   - **DB unavailable** → `await` rejects → the form action returns 500. The
 *     login flow already cannot proceed without Postgres (BetterAuth needs it),
 *     so failing closed here is consistent with the rest of the path.
 */

import { prisma } from '$lib/server/db';

export type OtpAttemptBucket = 'request' | 'verify';

interface BucketConfig {
  max: number;
  windowMs: number;
}

const BUCKETS: Record<OtpAttemptBucket, BucketConfig> = {
  request: { max: 3, windowMs: 10 * 60 * 1000 },
  verify: { max: 5, windowMs: 10 * 60 * 1000 },
};

/**
 * Longest window across buckets. The cron sweep at
 * `/api/jobs/sweep-otp-attempts` uses this as its delete cutoff so a single
 * exported constant tracks bucket config without restating it.
 */
export const MAX_BUCKET_WINDOW_MS = Math.max(
  ...Object.values(BUCKETS).map((b) => b.windowMs),
);

function normalize(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Pure read of the current attempt count for `(bucket, email)`. Does not
 * record anything: call {@link recordAttempt} after a real one.
 */
export async function checkRateLimit(
  bucket: OtpAttemptBucket,
  email: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const { max, windowMs } = BUCKETS[bucket];
  const cutoff = new Date(Date.now() - windowMs);
  const normalized = normalize(email);

  // One read covers both questions: is the count at the cap, and (if so) when
  // does the oldest in-window attempt age out? `take: max` caps the scan; we
  // never need more than that to answer either question.
  const attempts = await prisma.otpAttempt.findMany({
    where: { bucket, email: normalized, createdAt: { gt: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: max,
    select: { createdAt: true },
  });
  if (attempts.length < max) return { allowed: true };

  const retryAfterSeconds = Math.ceil(
    (attempts[0]!.createdAt.getTime() + windowMs - Date.now()) / 1000,
  );
  return { allowed: false, retryAfterSeconds };
}

/**
 * Record one attempt against `(bucket, email)`. Call from the appropriate
 * branch of the handler (see file-level doc): post-send for `request`, catch
 * branch for `verify`.
 */
export async function recordAttempt(
  bucket: OtpAttemptBucket,
  email: string,
): Promise<void> {
  await prisma.otpAttempt.create({
    data: { bucket, email: normalize(email) },
  });
}
