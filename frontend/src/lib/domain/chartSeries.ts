/**
 * The colours a chart gives its parts, in the order the charte Epitech gives
 * them (`DESIGN.md` § Chart series): the four brand accents, the same four at
 * 70 %, then grey. The first part takes the first colour, the second the
 * second, and so on, on every chart, so a staff member reads Jump's charts as
 * the house's own (PO, 29/10/2026).
 *
 * Two tones sit outside the series because they carry a meaning rather than a
 * rank:
 *   - `drift` is the verdict « Indécis », as every closing screen tones it;
 *   - `missing` is a part whose value nobody gave (« Non renseigné », « Sans
 *     avis »). It is painted, in the series' mid grey, like every part, as the
 *     mockup paints them: left blank, it read as a hole in the chart, the
 *     fault the PO first reported on the genre pie. That grey stays its own,
 *     since a ring draws `RING_PARTS` ranks and never reaches the ninth.
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

export type ChartTone = SeriesTone | 'drift' | 'missing';

/** The colour of the part at this rank; past the ninth, they share the grey. */
export function seriesTone(rank: number): SeriesTone {
  return CHART_SERIES[Math.min(Math.max(0, rank), CHART_SERIES.length - 1)];
}
