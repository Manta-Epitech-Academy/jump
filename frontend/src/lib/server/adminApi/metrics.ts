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

/**
 * A percentage, computed here so that nobody downstream has to.
 *
 * This is the same rule as {@link metric}, one step further. Returning only
 * counts reads as safe, but "combien de filles" and "quelle proportion de
 * filles" are the same question, so a consumer handed two counts will divide
 * them - and it will pick its own denominator, its own rounding, and its own
 * wording for what the ratio means. Any ratio a human would actually ask for is
 * therefore a figure this tier returns, with its own definition.
 *
 * Null, never zero, when there is nothing to divide: 0 % of an empty cohort is a
 * statement about the cohort that is not true.
 */
export function share(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}
