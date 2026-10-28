import type { ChartTone } from '$lib/domain/eventHome';

/**
 * A chart tone as classes: the ring's stroke and the legend's swatch, from the
 * same token so the two can never disagree. Raw accents, since these are fills
 * and never text (`DESIGN.md`: raw for fills, ink for text under 24px).
 *
 * `muted` is an absence (« Non renseigné », « Sans avis »), so it is not
 * painted: its arc is the ring's own empty track and its swatch an empty box.
 * Painted in a light grey, it was one step from `drift`, the grey every closing
 * screen gives « Indécis », and the two read as the same answer.
 */
export const CHART_TONE_CLASS: Record<
  ChartTone,
  { stroke: string; swatch: string }
> = {
  blue: { stroke: 'stroke-epi-blue', swatch: 'bg-epi-blue' },
  tomorrow: { stroke: 'stroke-epi-tomorrow', swatch: 'bg-epi-tomorrow' },
  tech: { stroke: 'stroke-epi-tech', swatch: 'bg-epi-tech' },
  together: { stroke: 'stroke-epi-together', swatch: 'bg-epi-together' },
  lavender: { stroke: 'stroke-epi-lavender', swatch: 'bg-epi-lavender' },
  drift: {
    stroke: 'stroke-muted-foreground/40',
    swatch: 'bg-muted-foreground/40',
  },
  muted: {
    stroke: 'stroke-muted',
    swatch: 'border border-muted-foreground/50',
  },
};
