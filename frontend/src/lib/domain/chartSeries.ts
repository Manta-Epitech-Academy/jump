/**
 * The colours a chart gives its parts, in the order the charte Epitech gives
 * them (`DESIGN.md` § Chart series): the four brand accents, the same four at
 * 70 %, then grey. The first part takes the first colour, the second the
 * second, and so on, on every chart, so a staff member reads Jump's charts as
 * the house's own (PO, 29/10/2026).
 *
 * Two tones sit outside the series because they carry a meaning rather than a
 * rank: `drift` is the verdict « Indécis » as every closing screen tones it,
 * and `muted` is what is missing (« Non renseigné », « Sans avis »), left
 * unpainted.
 */
export const CHART_SERIES = [
  'blue',
  'tomorrow',
  'tech',
  'together',
  'blueTint',
  'tomorrowTint',
  'techTint',
  'togetherTint',
  'grey',
] as const;

export type SeriesTone = (typeof CHART_SERIES)[number];

export type ChartTone = SeriesTone | 'drift' | 'muted';

/** The colour of the part at this rank; past the ninth, they share the grey. */
export function seriesTone(rank: number): SeriesTone {
  return CHART_SERIES[Math.min(Math.max(0, rank), CHART_SERIES.length - 1)];
}
