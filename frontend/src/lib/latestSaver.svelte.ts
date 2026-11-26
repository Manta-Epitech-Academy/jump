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
  #onFailed: (saved: T) => void;

  /**
   * @param saved what the server holds now
   * @param save sends one value; a rejection is a refusal
   * @param onFailed called with what the server holds when the last save of a
   *   burst was refused
   */
  constructor(
    saved: T,
    save: (value: T) => Promise<unknown>,
    onFailed: (saved: T) => void,
  ) {
    this.#saved = saved;
    this.#save = save;
    this.#onFailed = onFailed;
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
    let refused = false;
    try {
      await this.#save(value);
      this.#saved = value;
    } catch {
      refused = true;
    }
    const next = this.#pending;
    this.#pending = null;
    if (next) return this.#run(next.value);
    this.busy = false;
    if (refused) this.#onFailed(this.#saved);
  }
}
