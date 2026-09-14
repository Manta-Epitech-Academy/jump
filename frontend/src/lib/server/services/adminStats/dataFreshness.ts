/**
 * How old the data behind an answer is.
 *
 * Every figure this API returns is computed over rows Salesforce feeds, so a dead
 * worker does not make an answer fail: it makes it confidently describe last week.
 * `scope.ts` already refuses to answer a question about a périmètre that does not
 * exist rather than reporting zero; this is the same posture applied to time, and
 * the missing half of it. A stale figure has to say so.
 *
 * Owns the staleness judgement and the cadence sentence for the whole codebase.
 * `syncHealth.ts` used to hold both and is now a consumer: it still answers the
 * richer operational question (what the last run did, plus the error backlog),
 * but "when did data last land, and is that too long ago" is decided here, once,
 * so an ops answer and a leadership answer cannot disagree on what counts as old.
 *
 * Both used to be constants, and both were wrong the moment the cadence became
 * something the team edits. A fixed "environ toutes les 30 minutes" is quoted
 * verbatim into the weekly digest and into MCP answers, so it would keep being
 * said long after somebody tightened the incremental to 15 minutes for a stage;
 * and a fixed three-hour threshold called a healthy platform stale on a slow
 * cadence while staying silent through six missed passes on a tight one. Both
 * are now derived from `Sync_Cadence`, in `domain/syncSchedule.ts`.
 */

import { metric, type Metric } from '$lib/server/adminApi/metrics';
import { lastSuccessfulLanding } from '$lib/server/services/syncRunService';
import { listCadences } from '$lib/server/services/syncConfigService';
import { staleAfterHours, syncCadenceNote } from '$lib/domain/syncSchedule';

/** Age in hours, one decimal. Shared so two answers cannot round differently. */
export const hoursSince = (date: Date) =>
  Math.round(((Date.now() - date.getTime()) / 3_600_000) * 10) / 10;

/**
 * The staleness judgement and the cadence sentence, read together because they
 * come from the same two rows and every caller needs both.
 */
export async function syncFreshnessTerms(): Promise<{
  staleAfterHours: number;
  cadenceNote: string;
}> {
  const cadences = await listCadences();
  return {
    staleAfterHours: staleAfterHours(cadences),
    cadenceNote: syncCadenceNote(cadences),
  };
}

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
  const [last, terms] = await Promise.all([
    lastSuccessfulLanding(),
    syncFreshnessTerms(),
  ]);

  return metric(
    last
      ? {
          at: last.toISOString(),
          ageHours: hoursSince(last),
          stale: hoursSince(last) > terms.staleAfterHours,
        }
      : null,
    `Ancienneté des données sur lesquelles cette réponse est calculée : « at » est la dernière synchronisation Salesforce reçue par Jump, « ageHours » son ancienneté en heures, et « stale » vaut vrai au-delà de ${terms.staleAfterHours} h (${terms.cadenceNote}). Quand « stale » vaut vrai, les chiffres ci-dessus décrivent la situation telle qu'elle était à cette date, et il faut le dire en les citant. Vaut null si aucune synchronisation n'a jamais réussi, auquel cas rien ne garantit la fraîcheur des chiffres.`,
  );
}
