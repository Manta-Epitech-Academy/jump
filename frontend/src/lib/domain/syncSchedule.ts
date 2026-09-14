/**
 * When the Salesforce worker should run, in which mode, and over which window.
 *
 * The worker is stateless and ephemeral: a CronJob wakes it on a fixed fine tick
 * and it asks Jump what to do. So this decision lives here rather than there,
 * and the cadence the team edits takes effect at the next tick with nothing to
 * redeploy. Kept in `domain/` and pure: it is the one piece of this surface that
 * has to be exercised across a matrix of clocks, and a database makes that
 * awkward for no gain.
 *
 * Two modes, and the split is about cost downstream, not about Salesforce
 * quota. An incremental pass sends only the campaigns touched since the
 * watermark, so it stays cheap on Jump's side; a full pass sends the whole
 * whitelist and is the only one that can notice a DELETION, since removing a
 * member from a campaign moves no modstamp anywhere. Hence a frequent
 * incremental for freshness, a spaced full as the deletion net.
 */

/** The two passes the worker knows how to make. Mirrors the `SyncMode` enum. */
export type SyncMode = 'full' | 'incremental';

/**
 * Widen the incremental window by this much before asking Salesforce.
 *
 * Two clocks are involved (Jump's and Salesforce's) and neither is the other's,
 * so a window that starts exactly where the last one is believed to have
 * started loses whatever sat in the gap. Re-reading a few minutes twice costs
 * nothing: every write the sync performs is an upsert.
 */
export const SYNC_WATERMARK_MARGIN_MINUTES = 10;

/** One side of the cadence table: how long a mode waits before it is due again. */
export type SyncCadence = { mode: SyncMode; intervalMinutes: number };

/**
 * What a past run contributes to the decision, and why it is two dates.
 *
 * `finishedAt` answers "how long since data last landed", so it decides whether
 * a mode is DUE. `startedAt` decides what the next incremental has to COVER: a
 * record modified while a run was executing carries a modstamp the run's
 * `finishedAt` has already passed, so resuming from `finishedAt` would skip it
 * silently. The two are only ever the same when a run is instantaneous.
 */
export type SyncRunMark = { startedAt: Date; finishedAt: Date };

export type SyncDecision = {
  shouldSync: boolean;
  /**
   * Always a valid mode, including when `shouldSync` is false. The worker
   * validates this field before it looks at `shouldSync`, so a heartbeat answer
   * that omitted it or left it empty would make the run fail rather than no-op.
   */
  mode: SyncMode;
  /**
   * ISO 8601 floor for the incremental pass, or `null` in `full`. Always
   * present as a key: the worker rejects the answer outright if it is absent,
   * and `undefined` does not survive `JSON.stringify` either.
   */
  since: string | null;
};

function minutesSince(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / 60_000;
}

function intervalOf(cadences: readonly SyncCadence[], mode: SyncMode): number {
  const found = cadences.find((c) => c.mode === mode);
  // The two rows ship with the migration that creates the table, so a missing
  // one is a broken database rather than a state to paper over with a default:
  // one guessed value here would silently run the platform on a cadence nobody
  // chose, in the direction (too often, or never) the guess happened to take.
  if (!found) throw new Error(`No sync cadence configured for mode "${mode}"`);
  return found.intervalMinutes;
}

function isDue(
  last: SyncRunMark | null,
  cadences: readonly SyncCadence[],
  mode: SyncMode,
  now: Date,
): boolean {
  // Never run in this mode: due immediately. A platform that has never pulled
  // anything is the case where waiting is least defensible.
  if (!last) return true;
  return minutesSince(last.finishedAt, now) >= intervalOf(cadences, mode);
}

/**
 * Decide the next run from the clock, the configured cadences, and the last
 * SUCCESSFUL run of each mode.
 *
 * Only successful runs count, and that is the whole failure story: a run that
 * ends in error moves nothing, so the next tick asks for the same window again
 * instead of stepping over it. Nothing else has to remember that a run failed.
 *
 * `full` outranks `incremental` when both are due. Doing the incremental first
 * would advance its watermark over a window the full pass is about to cover
 * anyway, spending a run to learn nothing.
 */
export function decideSync(input: {
  now: Date;
  cadences: readonly SyncCadence[];
  lastOkFull: SyncRunMark | null;
  lastOkIncremental: SyncRunMark | null;
}): SyncDecision {
  const { now, cadences, lastOkFull, lastOkIncremental } = input;

  if (isDue(lastOkFull, cadences, 'full', now)) {
    return { shouldSync: true, mode: 'full', since: null };
  }

  if (isDue(lastOkIncremental, cadences, 'incremental', now)) {
    return {
      shouldSync: true,
      mode: 'incremental',
      since: incrementalSince(lastOkIncremental),
    };
  }

  // Nothing due. The mode still has to be a real one, so name the pass that
  // would come next: it is what an operator reading the config answer expects,
  // and what the worker's own validation requires.
  return {
    shouldSync: false,
    mode: 'incremental',
    since: incrementalSince(lastOkIncremental),
  };
}

/**
 * The floor an incremental pass reads from: the start of the last successful
 * one, pushed back by the margin. `null` when there has never been one, which
 * tells the worker to take the whole whitelist.
 */
function incrementalSince(last: SyncRunMark | null): string | null {
  if (!last) return null;
  return new Date(
    last.startedAt.getTime() - SYNC_WATERMARK_MARGIN_MINUTES * 60_000,
  ).toISOString();
}

/**
 * How old the last landing may get before it is worth mentioning, derived from
 * the cadence actually configured rather than fixed.
 *
 * A constant lied in both directions: at a 3 h incremental it flagged a healthy
 * platform, and at the 15 min one the team switches to during a stage it would
 * have stayed quiet through six missed passes. Three missed passes is the
 * signal, with a floor so a very tight cadence does not turn one slow run into
 * an alarm.
 */
export const SYNC_STALE_AFTER_MISSED_PASSES = 3;
export const SYNC_STALE_FLOOR_HOURS = 1;

export function staleAfterHours(cadences: readonly SyncCadence[]): number {
  const hours =
    (intervalOf(cadences, 'incremental') * SYNC_STALE_AFTER_MISSED_PASSES) / 60;
  return Math.max(SYNC_STALE_FLOOR_HOURS, Math.round(hours * 10) / 10);
}

/**
 * The one sentence that says how often data is supposed to land, composed from
 * the configured cadences so every definition built on it quotes the cadence in
 * force. It used to be a hardcoded "environ toutes les 30 minutes", which the
 * first edit of the table would have made false everywhere it is quoted, the
 * weekly digest included.
 */
export function syncCadenceNote(cadences: readonly SyncCadence[]): string {
  const incremental = describeInterval(intervalOf(cadences, 'incremental'));
  const full = describeInterval(intervalOf(cadences, 'full'));
  return `le worker de synchronisation tourne toutes les ${incremental}, avec une reprise complète toutes les ${full}`;
}

/**
 * Minutes as the French phrase a definition carries mid-sentence, after
 * « toutes les ». Reads as a duration a person would say out loud: hourly is
 * « toutes les heures », daily « toutes les 24 heures ».
 */
function describeInterval(minutes: number): string {
  if (minutes < 60) return minutes === 1 ? 'minutes' : `${minutes} minutes`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? '24 heures' : `${days} jours`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'heures' : `${hours} heures`;
  }
  return `${minutes} minutes`;
}
