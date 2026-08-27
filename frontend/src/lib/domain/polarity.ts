/**
 * How favourable an answer is: one vocabulary, two provenances.
 *
 * Two features carry this notion and they arrive at it differently. A feedback
 * `scale` derives it from the order its options were authored in; a closing
 * question stores it per option, because a bank question is composed by hand and
 * its author is the one who knows whether "Peut-être" sits above or below "Pas
 * pour le moment". Different sources, same three levels, and the levels are the
 * part that must not fork: the day this becomes five, the chip colours and the
 * favourable shares have to move together, and sharing the type makes that a
 * compile error rather than a silent divergence.
 *
 * It lives in its own module rather than in either feature's, so that neither has
 * to import the other. Closings and feedback are deliberately separate concepts
 * (see the closings section of AGENTS.md), and a closing file importing from
 * `domain/feedback` would read as though that decision had been quietly reversed.
 */

export type AnswerPolarity = 'positive' | 'neutral' | 'negative';

export const ANSWER_POLARITIES: readonly AnswerPolarity[] = [
  'positive',
  'neutral',
  'negative',
];

export function isAnswerPolarity(v: string): v is AnswerPolarity {
  return (ANSWER_POLARITIES as readonly string[]).includes(v);
}

/**
 * How favourable one answer of an ordered scale is, read off its position.
 *
 * The order of a question's options is its meaning: a `scale` is authored best
 * first, which is the contract the respondent-facing renderer already relies on
 * ("Index 0 = best" in `components/feedback/scale.ts`) and which the editor shows
 * by numbering them. Nothing stores a score per option, and nothing needs to -
 * position already says it.
 *
 * Here rather than in the one screen that first needed it, because the moment a
 * figure is computed from it (a favourable share, a ranking between campuses) two
 * places decide what "good" means, and they drift. Thresholds are the ones the dev
 * feedback roster has been using: for the four options of the stage bilan this
 * reads positive / positive / neutral / negative.
 *
 * `index` is the position among the question's `choice` options only, in authored
 * order. An `extra` option is a legitimate answer off the scale (the escape hatch
 * beside it), so it has no place on the scale and no polarity.
 */
export function optionPolarity(index: number, total: number): AnswerPolarity {
  // A one-option scale has no spread to read: calling its single answer positive
  // would invent a verdict the question never offered.
  if (total <= 1) return 'neutral';
  const ratio = index / (total - 1);
  if (ratio <= 0.34) return 'positive';
  if (ratio >= 0.75) return 'negative';
  return 'neutral';
}
