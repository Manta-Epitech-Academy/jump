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
 * Storage shape follows `.claude/rules/data-model.md`'s "facts as rows, state as projection"
 * pattern (cf. `XpGrant`, `MinigameAttempt`): the `OtpAttempt` table holds one
 * row per attempt that counts, and the bucket's "current attempt count" is the
 * projection computed fresh on every claim. No mutable counter, no in-process
 * state.
 *
 * Call pattern (both endpoints, both routes): `await claimAttempt(bucket,
 * email)` BEFORE the work, and bail with 429 if it is refused. An allowed claim
 * already counts; `release()` it when the attempt turns out not to:
 *
 *   - `request`: when no code was sent (lookup-404 or an error before the
 *     send); only a sent code costs real money and fills a mailbox.
 *   - `verify`: when the sign-in succeeded; clean sign-ins don't consume
 *     budget, only failures do.
 *
 * Deploy notes:
 *
 *   - **Single source of truth for the OTP path.** BetterAuth's emailOTP plugin
 *     ships its own per-IP limiter (3 req / 60s on `/sign-in/email-otp` by
 *     default), which would lock out 197 of 200 cohort members regardless of
 *     anything we do here. It never runs: BetterAuth applies it in its HTTP
 *     router only, and `auth.ts` mounts none of the plugin's routes there
 *     (`disabledPaths`). Every OTP is minted and consumed through `auth.api.*`,
 *     so this module is the only limit, and a caller that sends or checks a
 *     code on a visitor's behalf must go through it.
 *   - **Cluster-safe.** The ledger is in Postgres, so any number of SvelteKit
 *     replicas share one budget per email. A pod restart doesn't reset
 *     counters (the in-memory predecessor did, which was a soft hole an
 *     attacker could exploit by triggering restarts).
 *   - **Cluster cleanup** is the cron sweep at `POST /api/jobs/sweep-otp-attempts`
 *     (hourly is plenty: at ~1k attempts/day with 10-min windows, the table
 *     peaks at ~50 stale rows between sweeps). Module-level timers would
 *     race across pods, so cleanup is centralised in the cron, not in-process.
 *   - **Write first, count second.** A claim commits its row and only then
 *     counts the window, so of two concurrent claims the later count sees
 *     both: never admitted past the cap. The price is that a burst larger than
 *     the cap can be refused whole, each claim counting the others before they
 *     are taken back; only abuse sends that many at once, and a double submit
 *     stays well under it. Reading the count first and recording after the work, the shape
 *     this replaced, let ten parallel requests all read a count under 3.
 *   - **A refused claim takes its row back**, so hammering a locked address
 *     does not extend the lock: it lifts when the oldest attempt in the window
 *     ages out, 10 minutes at most.
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

export type AttemptClaim =
  | { allowed: true; release: () => Promise<void> }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Count one attempt against `(bucket, email)`, unless the window is already
 * full. The row is written before the window is read; see the file-level doc
 * for why that order, and for when to call `release`.
 */
export async function claimAttempt(
  bucket: OtpAttemptBucket,
  email: string,
): Promise<AttemptClaim> {
  const { max, windowMs } = BUCKETS[bucket];
  const normalized = normalize(email);

  const { id } = await prisma.otpAttempt.create({
    data: { bucket, email: normalized },
    select: { id: true },
  });
  const release = async () => {
    // `deleteMany` rather than `delete`, so a second call, or a row the cron
    // sweep already took, is not an error.
    await prisma.otpAttempt.deleteMany({ where: { id } });
  };

  // One read covers both questions: is this claim over the cap, and (if so)
  // when does the oldest in-window attempt age out? `take: max + 1` caps the
  // scan; one row past the cap is all it takes to know.
  const cutoff = new Date(Date.now() - windowMs);
  const attempts = await prisma.otpAttempt.findMany({
    where: { bucket, email: normalized, createdAt: { gt: cutoff } },
    orderBy: { createdAt: 'asc' },
    take: max + 1,
    select: { createdAt: true },
  });
  if (attempts.length <= max) return { allowed: true, release };

  await release();
  const retryAfterSeconds = Math.ceil(
    (attempts[0]!.createdAt.getTime() + windowMs - Date.now()) / 1000,
  );
  return { allowed: false, retryAfterSeconds };
}
