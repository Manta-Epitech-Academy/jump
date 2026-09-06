import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * The monthly-rotating pseudonym that stands in for a talent in
 * `Usage_FeatureUse`.
 *
 * `sha256(actorId + campusId + "YYYY-MM" + USAGE_SALT)`. Distinct-actor counts
 * stay exact within a month, a join back to the person is not possible without
 * the salt, and the pseudonym decays on its own at the month boundary. The
 * consequence to keep in mind when reading a figure is that the talent metric is
 * MONTHLY active, not annual: someone active in ten months is ten pseudonyms,
 * which is also the standard shape for this metric.
 *
 * FAILS CLOSED. With `USAGE_SALT` unset there is no pseudonym to compute, so the
 * caller records nothing rather than hashing against an empty salt, which would
 * produce a stable, cross-month, trivially-recomputable identifier for a minor.
 * Same doctrine as `OUTBOUND_MODE` in `outbound.ts`: an env var rather than a DB
 * flag, so it tracks the environment instead of riding a `pg_dump` from prod
 * into staging, and the unset case is the safe one.
 *
 * The salt is read per call rather than captured at module load so a rotation
 * takes effect without a redeploy. It is a hash of an id, not a signature, so
 * there is no timing-comparison concern here.
 */
export function actorHash(
  actorId: string,
  campusId: string | null,
  at: Date,
): string | null {
  const salt = env.USAGE_SALT;
  if (!salt) return null;
  return createHash('sha256')
    .update(`${actorId}|${campusId ?? ''}|${usageMonth(at)}|${salt}`)
    .digest('hex');
}

/** Whether pseudonymous recording is possible at all. */
export function usageSaltConfigured(): boolean {
  return Boolean(env.USAGE_SALT);
}

/**
 * The month a use is filed under, `"YYYY-MM"`, in UTC.
 *
 * UTC and not Europe/Paris on purpose: this string is only ever a grouping key
 * for the rollup and for the pseudonym's rotation, never a date shown to anyone.
 * A campus-local month would make the same use fall in two different months
 * depending on which campus read it, and the rollup's unique constraint would
 * then hold two rows for one fact.
 */
export function usageMonth(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}
