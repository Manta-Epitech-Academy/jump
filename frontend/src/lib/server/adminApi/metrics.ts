/**
 * Every number the curated admin API returns is wrapped with the definition of
 * what it counts.
 *
 * This is the first design rule of the whole subsystem, made structural: the
 * consumer is a language model, and a bare `{ inscrits: 187 }` invites it to
 * explain, combine or re-aggregate that figure into something plausible and
 * wrong. A number that arrives carrying "participations en statut READY ou MEET"
 * can be quoted, and quoting is all we want it to do.
 *
 * Definitions are written in French, staff register: they end up verbatim in
 * front of a human, in a chat answer or in the weekly digest.
 */

export type Metric<T = number> = {
  value: T;
  /** What this figure counts, in one sentence a non-technical reader can quote. */
  definition: string;
};

export function metric<T>(value: T, definition: string): Metric<T> {
  return { value, definition };
}
