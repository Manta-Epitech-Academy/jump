import type { Action } from 'svelte/action';
import { onImageBroken } from './onImageBroken';

/**
 * Hide every picture inside this node that cannot be shown, for HTML a
 * component renders with `{@html}` and so cannot put `onImageBroken` on itself
 * (a campus note's pictures). A picture whose copy went missing, or one of a
 * generated database whose key has no bytes behind it, leaves no broken-image
 * glyph in the middle of the text.
 *
 * The parameter is the HTML rendered, so a new message is walked again.
 */
export const hideBrokenPictures: Action<HTMLElement, string> = (node) => {
  let cleanups: (() => void)[] = [];

  const watch = () => {
    for (const cleanup of cleanups) cleanup();
    cleanups = [...node.querySelectorAll('img')].map((img) => {
      const hide = () => {
        (img.closest('picture') ?? img).setAttribute('hidden', '');
      };
      return onImageBroken(img, hide)?.destroy ?? (() => {});
    });
  };

  watch();
  return {
    update: watch,
    destroy() {
      for (const cleanup of cleanups) cleanup();
    },
  };
};
