/**
 * Saves a value the screen owns, in the order the person chose it (#552).
 *
 * A control that applies at once (a toggle, a choice among options) shows the
 * new value before the server has it, so the screen is the truth and the server
 * a copy. Sending one request per click breaks the copy: two requests on the
 * wire at once may be written in either order, and aborting the first in the
 * browser does not stop it reaching the server, so the stored value can end on
 * an older click than the one on screen. That is what rolled the EpiDuck's
 * accessories back in QA on 26/11/2026.
 *
 * So one save is on the wire at a time, and a value pushed meanwhile waits for
 * it, replacing any value already waiting: a burst of clicks sends the first
 * and the last, in that order, and the server ends on the last. Each save
 * carries the whole value, which is why the ones in between can be dropped.
 * A burst that comes back to what the server holds sends nothing more: there
 * is nothing to store, and nothing a refusal of it could undo.
 *
 * Nothing the server answers is written back to the screen. Only a refusal of
 * the last save hands back the last value the server did store, for the screen
 * to return to it: a refusal followed by a save that went through changes
 * nothing, since that save carried the newer value.
 */
export class LatestSaver<T> {
  /** A save is on the wire or waiting. */
  busy = $state(false);

  #saved: T;
  #pending: { value: T } | null = null;
  #save: (value: T) => Promise<unknown>;
  #onFailed: (saved: T, error: unknown) => void;
  #same: (a: T, b: T) => boolean;

  constructor(options: {
    /** What the server holds now. */
    saved: T;
    /** Sends one value; a rejection is a refusal. */
    save: (value: T) => Promise<unknown>;
    /**
     * Called with what the server holds when the last save of a burst was
     * refused, the screen showing a value the server does not have, and with
     * what the refusal threw, for the caller to log where it knows what failed.
     */
    onFailed: (saved: T, error: unknown) => void;
    /** Whether two values are the same one; `Object.is` unless given. */
    same?: (a: T, b: T) => boolean;
  }) {
    this.#saved = options.saved;
    this.#save = options.save;
    this.#onFailed = options.onFailed;
    this.#same = options.same ?? Object.is;
  }

  push(value: T): void {
    if (this.busy) {
      this.#pending = { value };
      return;
    }
    this.busy = true;
    void this.#run(value);
  }

  async #run(value: T): Promise<void> {
    let refusal: { error: unknown } | null = null;
    try {
      await this.#save(value);
      this.#saved = value;
    } catch (error) {
      refusal = { error };
    }
    const next = this.#pending;
    this.#pending = null;
    if (next && !this.#same(next.value, this.#saved)) {
      return this.#run(next.value);
    }
    this.busy = false;
    // The screen ends on `next` when there is one, which the server holds.
    if (refusal && !next) this.#onFailed(this.#saved, refusal.error);
  }
}
