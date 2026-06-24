/**
 * Live-autosave wiring for a single text field in the feedback builder.
 *
 * Returns `{ oninput, onblur }` handlers (not a Svelte action, so they attach to
 * the shadcn `<Input>` / `<Textarea>` components the same way they attach to a
 * raw `<input>` (both forward these props to the underlying element):
 *
 *  - **on input**: the field is marked dirty at once (so the header reads
 *    "non enregistré" the instant a key lands), then a debounced save fires
 *    `delay` ms after the last keystroke. `delay: 0` opts out of live save and
 *    keeps the field blur-only (still dirty-tracked).
 *  - **on blur**: any pending debounce is flushed immediately and the save runs
 *    one last time as `final`.
 *
 * `commit` owns all field-specific logic (change-check, normalisation, the patch
 * call). It receives `final` so a field can persist the raw value while typing
 * (keeping `element.value === patched value`, which Svelte's `set_value` guard
 * relies on to avoid moving the caret) and only normalise (trim, empty→null) on
 * blur, once focus has left. Returning a string snaps the field back to it (a
 * rejected rename reverting to the saved label, or a cleared required field
 * restoring its previous value).
 *
 * `registry` is read through a thunk, not captured, so a field still reports to
 * the right controller after the page rebuilds it for another form id.
 */

const DEFAULT_DELAY = 600;

/** The slice of the editor this needs: the dirty-field counter, entered/left in pairs. */
interface DirtyRegistry {
  enterDirty(): void;
  exitDirty(): void;
}

export interface AutosaveHandlers {
  oninput: (e: Event) => void;
  onblur: (e: Event) => void;
}

export interface AutosaveOptions {
  /** Resolves the dirty-field registry live (the controller can be rebuilt). */
  registry: () => DirtyRegistry;
  /** Persist the value. Return a string to force-correct the field's content. */
  commit: (value: string, ctx: { final: boolean }) => string | void;
  /** Debounce for live save while typing; `0` = save on blur only. */
  delay?: number;
}

type TextEl = HTMLInputElement | HTMLTextAreaElement;

export function createAutosave(opts: AutosaveOptions): AutosaveHandlers {
  const delay = opts.delay ?? DEFAULT_DELAY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Tracked locally so repeated keystrokes enter the dirty count once, and the
  // matching exit fires exactly once (on debounce or blur).
  let dirty = false;

  function setDirty(next: boolean) {
    if (next === dirty) return;
    dirty = next;
    if (next) opts.registry().enterDirty();
    else opts.registry().exitDirty();
  }

  function run(el: TextEl, final: boolean) {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    const corrected = opts.commit(el.value, { final });
    if (typeof corrected === 'string' && corrected !== el.value)
      el.value = corrected;
    setDirty(false);
  }

  return {
    oninput(e) {
      const el = e.currentTarget as TextEl;
      setDirty(true);
      if (delay <= 0) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => run(el, false), delay);
    },
    onblur(e) {
      run(e.currentTarget as TextEl, true);
    },
  };
}
