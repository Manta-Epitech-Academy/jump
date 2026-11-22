import { untrack } from 'svelte';

type Refreshable = {
  readonly ready: boolean;
  readonly error: unknown;
  refresh(): Promise<void>;
};

/**
 * Ask a remote query again whenever it is taken up from kit's cache.
 *
 * Kit keeps a query's answer until the last reference to it is garbage
 * collected, not until the component that asked lets go of it. So a dialog that
 * asks on open and is closed and reopened on the same row is handed the answer
 * it read the first time, however long ago: the émargement notes reopened on
 * « Aucune note » after a note was written, until the page was reloaded. A
 * dialog whose promise is "what is true now" calls this once at init with the
 * same getter it derives its query from.
 *
 * A query created fresh is already on its way and is left alone. One that comes
 * back settled is asked again: an answer is shown as it was and refreshed under
 * it, and a failure is tried again, so "reopen to retry" holds for a dialog
 * whose last attempt failed.
 */
export function refreshWhenReused(query: () => Refreshable | null): void {
  $effect(() => {
    const current = query();
    const settled = untrack(
      () => current && (current.ready || current.error !== undefined),
    );
    if (current && settled) void current.refresh();
  });
}
