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
 * The middle value of a set, for the figures that quote a median rather than a
 * mean (a duration, an XP total) because a long tail would drag an average away
 * from the common case.
 *
 * Here rather than in each aggregate for the same reason as {@link share}: it was
 * written twice, and the two spellings disagreed. An even-sized set returns the
 * mean of its two middle values, which is what "médiane" says; picking the upper
 * one instead reads as a real figure while being consistently biased upwards.
 *
 * Null, never zero, on an empty set: there is no middle of nothing.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  // Rounded like `share`, so two answers cannot report one middle differently.
  return Math.round(value * 10) / 10;
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

/**
 * One row of a ranking: whatever identifies it, its value, and its position.
 *
 * `rank` is null exactly when `value` is: a row the figure cannot be computed for
 * has no position in the ordering, and giving it the last rank would read as
 * "worst" instead of "unknown". Equal values share a rank, so a tie never looks
 * like an ordering.
 */
export type Ranked<Row> = Row & { rank: number | null };

/**
 * Sorts descending and stamps positions, so the consumer never orders anything.
 *
 * The same rule as {@link share} and {@link variation}, applied to ordering. "Quels
 * sont nos meilleurs campus" is one question, so a consumer handed an unordered
 * set will sort it - and pick its own handling of the rows it cannot measure,
 * which is where a ranking starts lying. A campus with no measurable value placed
 * last reads as the worst one.
 *
 * Here rather than in the one aggregate that needed it first: five other lists in
 * this tier come back sorted with no position at all (`topSchools`,
 * `byDepartement`, `byAcademie`, the churn lists, the interest breakdowns), which
 * is how a convention that exists in exactly one file gets re-derived or skipped.
 *
 * `labelOf` is the tie-break, so the same data always comes back in the same
 * order: a ranking that reshuffles between two identical calls reads as a change.
 * `valueOf` is what is ranked, read rather than assumed, so a row can name its own
 * figure (`favourableShare`) instead of every ranked answer having to call it
 * `value`.
 */
export function rank<Row>(
  rows: Row[],
  labelOf: (row: Row) => string,
  valueOf: (row: Row) => number | null,
): Ranked<Row>[] {
  const sorted = [...rows].sort((a, b) => {
    const [x, y] = [valueOf(a), valueOf(b)];
    if (x === null || y === null) {
      if (x === y) return labelOf(a).localeCompare(labelOf(b), 'fr');
      return x === null ? 1 : -1;
    }
    return y - x || labelOf(a).localeCompare(labelOf(b), 'fr');
  });

  let lastValue: number | null = null;
  // Standard competition ranking (1, 1, 3), not dense (1, 1, 2): the gap after a
  // tie is what says two rows shared a place.
  let lastRank = 0;
  return sorted.map((row, index) => {
    const value = valueOf(row);
    if (value === null) return { ...row, rank: null };
    if (value !== lastValue) {
      lastRank = index + 1;
      lastValue = value;
    }
    return { ...row, rank: lastRank };
  });
}

/**
 * What a ranking's definition says about its own axis, so every ranked answer
 * explains `rank` and `null` the same way.
 *
 * Takes the French forms of what one row is rather than hardcoding "campus": the
 * unit is part of the sentence, and a second ranking over events would otherwise
 * either say "campus" or reword the whole rule. Same reasoning as
 * `cohortNounForms` in `domain/event.ts`.
 */
export function rankAxisNote(unit: {
  singular: string;
  plural: string;
}): string {
  return `Un ${unit.singular} par ligne, du plus au moins élevé, « rank » étant sa position. Les ${unit.plural} dont la valeur ne peut pas être calculée valent null, sont placés en fin de liste et n'ont pas de rang : ce n'est pas un mauvais résultat, c'est une absence de mesure. Deux ${unit.plural} à égalité partagent le même rang.`;
}

/** The French forms of the units this tier ranks over, so a noun is typed once. */
export const RANK_UNITS = {
  campus: { singular: 'campus', plural: 'campus' },
  event: { singular: 'événement', plural: 'événements' },
  grid: { singular: 'grille', plural: 'grilles' },
} as const;
