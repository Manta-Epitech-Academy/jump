/**
 * How old the data behind an answer is.
 *
 * Every figure this API returns is computed over rows Salesforce feeds, so a dead
 * worker does not make an answer fail: it makes it confidently describe last week.
 * `scope.ts` already refuses to answer a question about a périmètre that does not
 * exist rather than reporting zero; this is the same posture applied to time, and
 * the missing half of it. A stale figure has to say so.
 *
 * Owns the staleness threshold and the cadence sentence for the whole codebase.
 * `syncHealth.ts` used to hold both and is now a consumer: it still answers the
 * richer operational question (what the last run created, updated and skipped,
 * plus the error backlog), but "when did data last land, and is that too long ago"
 * is decided here, once, so an ops answer and a leadership answer cannot disagree
 * on what counts as old.
 */

import { getLastSync } from '$lib/server/infra/syncStatus';
import { metric, type Metric } from '$lib/server/adminApi/metrics';

/** Beyond this, the last sync is old enough to be worth mentioning. */
export const SYNC_STALE_AFTER_HOURS = 3;

/**
 * The one sentence that says how often data is supposed to land, reused by every
 * definition built on it so the cadence is stated identically everywhere.
 */
export const SYNC_CADENCE_NOTE =
  'le worker de synchronisation tourne environ toutes les 30 minutes';

/** Age in hours, one decimal. Shared so two answers cannot round differently. */
export const hoursSince = (date: Date) =>
  Math.round(((Date.now() - date.getTime()) / 3_600_000) * 10) / 10;

export type DataFreshness = {
  /** ISO timestamp of the last sync Jump recorded. */
  at: string;
  ageHours: number;
  stale: boolean;
} | null;

/**
 * The leadership-safe subset: when data last landed and whether that is too long
 * ago. Deliberately not the row counts `stats_sync_health` returns - those are an
 * operational detail, and this figure travels with answers whose reader is not
 * the person who would act on them.
 */
export async function getDataFreshness(): Promise<Metric<DataFreshness>> {
  const last = await getLastSync();

  return metric(
    last
      ? {
          at: last.at.toISOString(),
          ageHours: hoursSince(last.at),
          stale: hoursSince(last.at) > SYNC_STALE_AFTER_HOURS,
        }
      : null,
    `Ancienneté des données sur lesquelles cette réponse est calculée : « at » est la dernière synchronisation Salesforce reçue par Jump, « ageHours » son ancienneté en heures, et « stale » vaut vrai au-delà de ${SYNC_STALE_AFTER_HOURS} h (${SYNC_CADENCE_NOTE}). Quand « stale » vaut vrai, les chiffres ci-dessus décrivent la situation telle qu'elle était à cette date, et il faut le dire en les citant. Vaut null si aucune synchronisation n'a jamais été enregistrée, auquel cas rien ne garantit la fraîcheur des chiffres.`,
  );
}
