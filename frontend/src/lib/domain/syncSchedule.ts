/**
 * When the Salesforce worker should run, in which mode, and over which window.
 *
 * The worker is stateless and ephemeral: a CronJob wakes it on a fixed fine tick
 * (`SYNC_WORKER_TICK_MINUTES`) and it asks Jump what to do. So this decision lives here rather than there,
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

/**
 * How often the CronJob wakes the worker, in minutes.
 *
 * The schedule itself lives in `jump-k3s` (`services/sfworker/base/cronjob.yml`)
 * and this mirrors it, because two things here are only right relative to it:
 * the lowest cadence worth accepting, and the wake-up slack below. Change both
 * sides together.
 *
 * It is also the whole latency of "sync now". A request (`ops_request_sync`) is
 * served at the next wake-up, and nothing pushes the worker awake sooner: Jump
 * never starts a Job on the cluster and the worker listens on no port. So the
 * tick is a minute, and a pass asked for during a demo leaves within it (#423).
 */
export const SYNC_WORKER_TICK_MINUTES = 1;

/**
 * How early in its interval a mode may be called due, to absorb the worker's
 * wake-up.
 *
 * The decision is made at a tick, but the run it opens is stamped a moment
 * later (`startedAt` is Jump's clock at `POST /runs`), and two ticks never wake
 * the pod with exactly the same delay: in production a run lands 3 to 10 s
 * after its tick. So at the tick the cadence names, the time since the last
 * start is the interval minus a few seconds, and a strict comparison skips
 * every other pass: a 15 min cadence ran every 30 in production (#419).
 *
 * In seconds because it measures that noise, not the cadence. It has to stay
 * under half the tick, or a pass that started just before one tick would run
 * again on the next tick before its interval is up; `syncSchedule.test.ts` holds
 * that against `SYNC_WORKER_TICK_MINUTES`.
 */
export const SYNC_WAKE_UP_SLACK_SECONDS = 20;

/**
 * The floor and the ceiling on a cadence.
 *
 * The floor is the worker's own tick: asking for a pass more often than the
 * CronJob wakes it does not make it run more often, it just makes the configured
 * number a lie. The ceiling is a fortnight, past which a full reconcile has
 * stopped being a deletion net in any useful sense.
 */
export const SYNC_CADENCE_MIN_MINUTES = SYNC_WORKER_TICK_MINUTES;
export const SYNC_CADENCE_MAX_MINUTES = 20_160;

/** One side of the cadence table: how long a mode waits before it is due again. */
export type SyncCadence = { mode: SyncMode; intervalMinutes: number };

/**
 * What a past run contributes to the decision: when it STARTED, not when it
 * finished, for both halves of it.
 *
 * Whether a mode is DUE: a cadence of N minutes means a pass starts every N
 * minutes. Counting from the end added each run's duration to every gap, so the
 * schedule slid back by a tick whenever a pass took longer than the slack.
 * What the next incremental has to COVER: a record modified while a run was
 * executing carries a modstamp the run's end has already passed, so resuming
 * from the end would skip it silently.
 */
export type SyncRunMark = { startedAt: Date };

/**
 * When a person last asked for a pass of each mode, or `null` if never.
 *
 * A request is a date and not a flag, because what makes it pending is
 * relative to the runs: it is satisfied by a successful run that STARTED after
 * it, and by nothing else. So nothing has to clear it, and a run that fails
 * leaves it pending exactly as it leaves the watermark.
 */
export type SyncRequests = { full: Date | null; incremental: Date | null };

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
  /**
   * Why the pass is due: its cadence, or a person asking for it. Ours, not the
   * worker's: `getWorkerConfig` hands the worker the three fields above and
   * nothing else, so its contract is unchanged. Names the cadence when nothing
   * is due, as `mode` names the pass that would come next.
   */
  reason: 'cadence' | 'requested';
};

function msSince(from: Date, now: Date): number {
  return now.getTime() - from.getTime();
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
  return (
    msSince(last.startedAt, now) >=
    intervalOf(cadences, mode) * 60_000 - SYNC_WAKE_UP_SLACK_SECONDS * 1_000
  );
}

/**
 * The requests still waiting for a run that covers them, each kept as the date
 * it was made, `null` for a mode with nothing pending.
 *
 * Compared on `startedAt`, never `finishedAt`: a run that was already in flight
 * when the request landed may have read Salesforce before the change the person
 * is waiting for, so it does not count even though it finished afterwards. A
 * full pass covers everything an incremental would, so it satisfies an
 * incremental request; the reverse is not true, since only a full pass can see
 * a deletion.
 */
export function pendingRequests(input: {
  requests: SyncRequests;
  lastOkFull: SyncRunMark | null;
  lastOkIncremental: SyncRunMark | null;
}): SyncRequests {
  const { requests, lastOkFull, lastOkIncremental } = input;
  const startedAfter = (run: SyncRunMark | null, at: Date) =>
    run !== null && run.startedAt.getTime() > at.getTime();
  const pending = (
    at: Date | null,
    covering: readonly (SyncRunMark | null)[],
  ) => (at && !covering.some((run) => startedAfter(run, at)) ? at : null);

  return {
    full: pending(requests.full, [lastOkFull]),
    incremental: pending(requests.incremental, [lastOkIncremental, lastOkFull]),
  };
}

/**
 * Decide the next run from the clock, the configured cadences, any pass a
 * person asked for, and the last SUCCESSFUL run of each mode.
 *
 * Only successful runs count, and that is the whole failure story: a run that
 * ends in error moves nothing, so the next tick asks for the same window again
 * instead of stepping over it. Nothing else has to remember that a run failed,
 * and that holds for a request too: it stays pending until a run covering it
 * succeeds (`pendingRequests`).
 *
 * `full` outranks `incremental` when both are due. Doing the incremental first
 * would advance its watermark over a window the full pass is about to cover
 * anyway, spending a run to learn nothing.
 */
export function decideSync(input: {
  now: Date;
  cadences: readonly SyncCadence[];
  requests: SyncRequests;
  lastOkFull: SyncRunMark | null;
  lastOkIncremental: SyncRunMark | null;
}): SyncDecision {
  const { now, cadences, requests, lastOkFull, lastOkIncremental } = input;

  const pending = pendingRequests({ requests, lastOkFull, lastOkIncremental });

  const fullRequested = pending.full !== null;
  if (fullRequested || isDue(lastOkFull, cadences, 'full', now)) {
    return {
      shouldSync: true,
      mode: 'full',
      since: null,
      reason: fullRequested ? 'requested' : 'cadence',
    };
  }

  const incrementalRequested = pending.incremental !== null;
  if (
    incrementalRequested ||
    isDue(lastOkIncremental, cadences, 'incremental', now)
  ) {
    return {
      shouldSync: true,
      mode: 'incremental',
      since: incrementalSince(lastOkIncremental),
      reason: incrementalRequested ? 'requested' : 'cadence',
    };
  }

  // Nothing due. The mode still has to be a real one, so name the pass that
  // would come next: it is what an operator reading the config answer expects,
  // and what the worker's own validation requires.
  return {
    shouldSync: false,
    mode: 'incremental',
    since: incrementalSince(lastOkIncremental),
    reason: 'cadence',
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
 * How old a mode's last landing may get before it is worth mentioning, derived
 * from the cadence actually configured rather than fixed.
 *
 * A constant lied in both directions: at a 3 h incremental it flagged a healthy
 * platform, and at the 15 min one the team switches to during a stage it would
 * have stayed quiet through six missed passes. Three missed passes is the
 * signal, with a floor so a very tight cadence does not turn one slow run into
 * an alarm.
 *
 * **The mode is a parameter, and that is the half the first version got wrong.**
 * One threshold read off the incremental was applied to both passes, so on the
 * shipped cadences (180 min and 1440) a full reconcile was called stale nine
 * hours after succeeding and stayed so for the fifteen hours until the next one
 * was even due. A figure that reads "vérifier" for most of every ordinary day is
 * a figure nobody reads at all, which is the same way the constant it replaced
 * failed. Each pass is judged against its own cadence or none of them is.
 */
export const SYNC_STALE_AFTER_MISSED_PASSES = 3;
export const SYNC_STALE_FLOOR_HOURS = 1;

export function staleAfterHours(
  cadences: readonly SyncCadence[],
  mode: SyncMode,
): number {
  const hours =
    (intervalOf(cadences, mode) * SYNC_STALE_AFTER_MISSED_PASSES) / 60;
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
