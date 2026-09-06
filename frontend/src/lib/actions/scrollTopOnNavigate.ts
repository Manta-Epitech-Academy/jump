import type { Action } from 'svelte/action';
import { afterNavigate } from '$app/navigation';

/**
 * Send this element back to the top on every navigation.
 *
 * Both staff spaces scroll a `<main class="overflow-y-auto">` rather than the
 * document, which quietly disables the one thing SvelteKit already does for you:
 * its scroll handling resets `window.scrollY`, and the window here never scrolls.
 * So following a link from halfway down a long page landed you halfway down the
 * next one, and the deeper the page the worse it read - clicking "Voir le
 * closing" from the bottom of a fiche opened the synthesis in its middle.
 *
 * Applied to the scroll container itself, in both layouts, rather than fixed at
 * a call site: it is a property of "this element is the viewport", not of any
 * one link.
 *
 * A same-page hash link is left alone, since it exists precisely to move the
 * scroll somewhere that is not the top. `popstate` is not excluded: nothing
 * captures this container's offset on the way out, so there is no position to
 * return to, and the top is a better answer than wherever the previous page
 * happened to be left.
 */
export const scrollTopOnNavigate: Action<HTMLElement> = (node) => {
  afterNavigate(({ to }) => {
    if (to?.url.hash) return;
    // `scrollTop` rather than `scrollTo({ behavior })`: this is a page change,
    // not a movement within a page, so animating it would show the reader a
    // journey through content they never asked to see.
    node.scrollTop = 0;
  });
};
