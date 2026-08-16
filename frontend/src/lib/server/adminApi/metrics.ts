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

/**
 * How a figure moved between two périmètres, most often two school years.
 *
 * The same rule as {@link share}, applied to time. Returning this year's figure
 * and last year's and nothing else reads as safe, but "est-ce qu'on progresse" is
 * one question, so a consumer handed two values will subtract them - and pick its
 * own wording for what the gap means. A growth figure is what a directeur général
 * quotes, so it is a figure this tier returns.
 */
export type Variation = {
  /** The figure on the périmètre being compared against. */
  previous: number | null;
  /** Plain units for a count, points on the figure's own scale otherwise. */
  absolute: number | null;
  /** Counts only: the same gap as a percentage of `previous`. */
  relative: number | null;
};

/**
 * `kind` decides one thing: whether a relative gap can be read without misleading.
 *
 * A count grows by a percentage anybody can quote ("+18 % d'inscrits"). A rate or
 * an average does not: 20 % becoming 30 % is +10 points, and calling it "+50 %" is
 * the classic misreading. So `points` returns the gap on the figure's own scale and
 * nothing else, and says why in the definition rather than leaving it to be noticed.
 */
export function variation(
  current: number | null,
  previous: number | null,
  kind: 'count' | 'points',
  /** What the comparison is against, e.g. "2025-2026". Printed as such. */
  comparedTo: string,
): Metric<Variation> {
  const gap = current != null && previous != null ? current - previous : null;
  const isCount = kind === 'count';

  return {
    value: {
      previous,
      // Exact for a count, rounded like `share` for anything on a decimal scale.
      absolute: gap == null ? null : isCount ? gap : Math.round(gap * 10) / 10,
      relative:
        isCount && gap != null && previous != null && previous > 0
          ? Math.round((gap / previous) * 1000) / 10
          : null,
    },
    definition: isCount
      ? `Évolution de cette figure par rapport à ${comparedTo} : « previous » est sa valeur sur ${comparedTo}, « absolute » l'écart en valeur absolue, « relative » ce même écart en pourcentage de ${comparedTo}. « relative » vaut null quand la valeur de ${comparedTo} est nulle ou inconnue, car il n'y a rien à rapporter. Ce que la figure compte est dit dans sa propre définition, à côté de sa valeur.`
      : `Évolution de cette figure par rapport à ${comparedTo} : « previous » est sa valeur sur ${comparedTo} et « absolute » l'écart exprimé en points sur la même échelle que la figure. « relative » vaut toujours null ici : l'évolution relative d'un taux ou d'une moyenne se lit de travers (passer de 20 % à 30 % est un écart de 10 points, pas une hausse de 50 %). Ce que la figure mesure est dit dans sa propre définition, à côté de sa valeur.`,
  };
}
