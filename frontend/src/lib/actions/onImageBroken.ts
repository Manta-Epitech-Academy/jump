import type { Action } from 'svelte/action';

/**
 * Call `onBroken` when this image cannot be shown, whenever that was decided.
 *
 * An `onerror` attribute alone misses the case that matters most: a picture
 * rendered on the server fails to load BEFORE the page hydrates, so its error
 * event has already fired when Svelte attaches the listener, and the browser's
 * broken-image glyph stays on screen inside the frame meant for the picture.
 * That is every picture of a generated database, whose keys have no bytes
 * behind them, and any picture whose stored object went missing. So the image
 * is also checked once on mount: complete with no pixels means it failed.
 */
export const onImageBroken: Action<HTMLImageElement, () => void> = (
  node,
  onBroken,
) => {
  let report = onBroken;
  const handle = () => report();
  if (node.complete && node.naturalWidth === 0) report();
  node.addEventListener('error', handle);
  return {
    update(next) {
      report = next;
    },
    destroy() {
      node.removeEventListener('error', handle);
    },
  };
};
