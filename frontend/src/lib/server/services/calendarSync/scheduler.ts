import type { ReconcileResult } from './types';

/**
 * Per-key coalescing scheduler for calendar-sync reconciles.
 *
 * Guarantees that for a given key, at most one reconcile is in flight at any
 * moment. Concurrent requests arriving while a reconcile is running collapse
 * into a single "next pass" that starts once the current one finishes;
 * additional requests piggy-back on that same pass. Each pass reads fresh DB
 * state, so callers always observe the latest reconciliation regardless of
 * how their requests interleaved.
 *
 * This is the invariant that lets the email backend insert
 * `OutlookCalendarSync` rows without racing the `(interviewId, userId)`
 * unique constraint: the constraint can only be violated when two reconciles
 * for the same (user, event) run concurrently, and the scheduler removes
 * that possibility.
 *
 * Single-instance only — the map lives in process memory; horizontal scale
 * would re-introduce the race across nodes. The deployment target is a
 * single SvelteKit process.
 */

type ReconcileFn = () => Promise<ReconcileResult>;

type Deferred = {
  promise: Promise<ReconcileResult>;
  resolve: (r: ReconcileResult) => void;
  reject: (e: unknown) => void;
};

type Slot = {
  /** Resolves once the currently-running pass settles. */
  running: Promise<unknown>;
  /** A coalesced next pass — additional requests share its promise. */
  queued: { fn: ReconcileFn; deferred: Deferred } | null;
};

const slots = new Map<string, Slot>();

export function reconcileKey(userId: string, eventId: string): string {
  return `${userId}:${eventId}`;
}

export function scheduleReconcile(
  key: string,
  fn: ReconcileFn,
): Promise<ReconcileResult> {
  const slot = slots.get(key);
  if (!slot) return start(key, fn);
  if (slot.queued) return slot.queued.deferred.promise;
  const deferred = defer();
  slot.queued = { fn, deferred };
  return deferred.promise;
}

function start(key: string, fn: ReconcileFn): Promise<ReconcileResult> {
  const promise = runAndAdvance(key, fn);
  slots.set(key, { running: promise.catch(() => undefined), queued: null });
  return promise;
}

async function runAndAdvance(
  key: string,
  fn: ReconcileFn,
): Promise<ReconcileResult> {
  try {
    return await fn();
  } finally {
    advance(key);
  }
}

function advance(key: string): void {
  const slot = slots.get(key);
  if (!slot) return;
  const queued = slot.queued;
  if (!queued) {
    slots.delete(key);
    return;
  }
  slot.queued = null;
  const next = runAndAdvance(key, queued.fn);
  slot.running = next.catch(() => undefined);
  next.then(queued.deferred.resolve, queued.deferred.reject);
}

function defer(): Deferred {
  let resolve!: Deferred['resolve'];
  let reject!: Deferred['reject'];
  const promise = new Promise<ReconcileResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
