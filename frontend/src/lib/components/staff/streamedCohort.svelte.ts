/**
 * Holds the last resolved value of a streamed `load` promise, with the guard
 * that makes it safe.
 *
 * A staff list page whose search, sort, filters or poll replace `data.cohort`
 * with a fresh promise must NOT bind `{#await}` directly: every navigation
 * would swap back to the skeleton and remount the results component, flashing
 * the shell, dropping focus out of the search box mid-typing and wiping the
 * roster's in-flight optimistic writes. Holding the last resolved value keeps
 * the component mounted, so a navigation swaps data in place and the skeleton
 * shows only on the first load. `frontend/src/lib/components/staff/CLAUDE.md`
 * states the rule; this is the one implementation of it.
 *
 * The `=== promise()` check is the load-bearing part: it drops a resolution that
 * arrives after a newer navigation has already started, which would otherwise
 * paint the previous filter's rows over the current ones. It was re-typed on
 * every page that needed it, comment included.
 *
 * Pass the promise as a thunk, not a value, so the effect re-reads `data.cohort`
 * both to subscribe to it and to compare against it on resolution.
 *
 *     const cohort = createStreamedCohort(() => data.cohort);
 *     // {#if cohort.value} … {:else if cohort.failed} … {:else}<ResultsSkeleton />
 *
 * Pages that are genuinely read-only (inscrits, closings, bilan) keep their
 * plain `{#await}`: with nothing replacing the promise, there is no reflash to
 * prevent and no reason to hold a second copy of the payload.
 */
export function createStreamedCohort<T>(promise: () => Promise<T>): {
  readonly value: T | null;
  readonly failed: boolean;
} {
  let value = $state<T | null>(null);
  let failed = $state(false);

  $effect(() => {
    const pending = promise();
    pending
      .then((resolved) => {
        if (promise() !== pending) return;
        value = resolved;
        failed = false;
      })
      .catch(() => {
        if (promise() !== pending) return;
        failed = true;
      });
  });

  return {
    get value() {
      return value;
    },
    get failed() {
      return failed;
    },
  };
}
