/**
 * The only door to the View Transitions API (DESIGN.md § Motion).
 *
 * `#lib/motion` owns how Svelte transitions move; this file owns the other
 * kind, where the browser snapshots the screen, lets the DOM change underneath
 * and animates from one picture to the other. `lint:design` refuses
 * `startViewTransition` anywhere else, for the reason it refuses
 * `svelte/transition`: each call site would otherwise decide on its own when to
 * animate, and the first one, in the root layout, decided "always".
 *
 * One kind of change goes through here: **a change of page**, which
 * crossfades (`crossfadePageChanges`), timed in `routes/layout.css` on the
 * motion tokens. Only a change of page: a filter, a sort, a list page or a
 * hash keeps the pathname, and fading the whole screen for it made a staff
 * list flicker at every filter, sort and search it ran.
 *
 * **A step within a page never uses one**, however tempting the API is for
 * it. For the length of a transition the browser sends every click to the
 * document root, whatever `pointer-events` the snapshots carry (measured in
 * Chromium): a pager pressed twice within 200ms lost its second press. A
 * step moves with a Svelte transition from `#lib/motion`, which leaves the
 * page live.
 */
import { onMount } from 'svelte';
import { onNavigate } from '$app/navigation';

/**
 * Whether a navigation earns the page crossfade, kept pure so the rule is
 * testable without a browser.
 *
 * `browserAnimated` is a back or forward gesture the browser has already
 * animated itself (a swipe on iOS or Android): crossfading after it replayed
 * the old page over the new one, so the talent saw the page change twice.
 */
export function shouldCrossfade({
  from,
  to,
  browserAnimated,
}: {
  from: { url: URL } | null;
  to: { url: URL } | null;
  browserAnimated: boolean;
}): boolean {
  if (!from || !to || browserAnimated) return false;
  return from.url.pathname !== to.url.pathname;
}

/**
 * Crossfade every change of page. Call once, during the root layout's init.
 *
 * SvelteKit does not pass the `popstate` event to `onNavigate`, so the
 * browser's own verdict (`hasUAVisualTransition`) is read from the event as it
 * passes: it is dispatched before `onNavigate` runs, since that waits for the
 * new page's `load`. A browser that does not report it reads `false`, which
 * keeps the crossfade there.
 */
export function crossfadePageChanges(): void {
  let lastPopstateAnimated = false;

  onMount(() => {
    const remember = (event: PopStateEvent) => {
      lastPopstateAnimated = event.hasUAVisualTransition ?? false;
    };
    window.addEventListener('popstate', remember);
    return () => window.removeEventListener('popstate', remember);
  });

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    const browserAnimated =
      navigation.type === 'popstate' && lastPopstateAnimated;
    if (!shouldCrossfade({ ...navigation, browserAnimated })) return;

    // SvelteKit's documented pattern: resolving lets it swap the page in
    // while the browser holds the old snapshot, and the transition ends once
    // the new page is on screen.
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
}
