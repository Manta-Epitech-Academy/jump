import { page } from '$app/state';
import { setListParams } from './urlList';

const PARAM = 'q';
const DEBOUNCE_MS = 300;

/**
 * A search box whose query lives in the URL: it holds what is being typed and
 * commits it to `?q` on a debounce, so the server-side filter runs once per
 * pause instead of once per keystroke.
 *
 * It also adopts a query that arrives from OUTSIDE, which is what a deep link
 * from the admin command palette (`…/talents?q=…`) is: the box fills with the
 * term instead of showing an empty field over a filtered list. Only the talents
 * directory did that; the notes gallery had the same deep links and left the box
 * blank.
 *
 * The `committed` mirror is what keeps that adoption from fighting the typist.
 * The effect cannot compare against the live value (reading it would re-run the
 * effect on every keystroke and overwrite the box mid-word), so it compares
 * against the last value we ourselves put in the URL: equal means our own commit
 * landing, different means a real navigation to adopt.
 */
export function createUrlSearch(): {
  value: string;
  clear(): void;
} {
  const initial = page.url.searchParams.get(PARAM) ?? '';
  let value = $state(initial);
  let committed = initial;
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const fromUrl = page.url.searchParams.get(PARAM) ?? '';
    if (fromUrl === committed) return;
    committed = fromUrl;
    value = fromUrl;
  });

  // Clear the pending commit when the component goes away, so a navigation
  // triggered by a box that no longer exists cannot land on the next page.
  $effect(() => () => clearTimeout(timer));

  function commit(next: string) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      committed = next;
      setListParams({ [PARAM]: next });
    }, DEBOUNCE_MS);
  }

  return {
    get value() {
      return value;
    },
    set value(next: string) {
      value = next;
      commit(next.trim());
    },
    clear() {
      clearTimeout(timer);
      value = '';
      committed = '';
    },
  };
}
