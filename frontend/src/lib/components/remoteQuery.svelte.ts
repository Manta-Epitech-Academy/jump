import { untrack } from 'svelte';

type Refreshable = {
  readonly ready: boolean;
  readonly error: unknown;
  refresh(): Promise<void>;
};

type Answering<T> = {
  readonly ready: boolean;
  readonly loading: boolean;
  readonly error: unknown;
  readonly current: T | undefined;
};

/**
 * A query's answer when something irreversible may act on it, or null.
 *
 * Kit keeps a query `ready` on its last answer while it is asked again and after
 * that request fails, which is right for what a screen shows and wrong for what
 * a decision reads. So the answer counts only once it is settled: loaded, not
 * being asked again, not failed. And only for the argument on screen: `asked` is
 * the key the query was asked for, `onScreen` the one the person is looking at,
 * and they differ while an edit waits out its debounce. The broadcast composer's
 * send reads its count through this, and states it in the confirmation.
 */
export function settledAnswer<T>(
  query: Answering<T> | null,
  keys: { asked: string | null; onScreen: string | null },
): T | null {
  if (!query || keys.asked === null || keys.asked !== keys.onScreen) {
    return null;
  }
  if (!query.ready || query.loading || query.error !== undefined) return null;
  return query.current ?? null;
}

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
