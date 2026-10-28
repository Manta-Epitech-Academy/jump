import type { ChartTone } from '$lib/domain/eventHome';

/**
 * A chart tone as classes: the ring's stroke and the legend's swatch, from the
 * same token so the two can never disagree. Raw accents, since these are fills
 * and never text (`DESIGN.md`: raw for fills, ink for text under 24px).
 */
export const CHART_TONE_CLASS: Record<
  ChartTone,
  { stroke: string; fill: string }
> = {
  blue: { stroke: 'stroke-epi-blue', fill: 'bg-epi-blue' },
  tomorrow: { stroke: 'stroke-epi-tomorrow', fill: 'bg-epi-tomorrow' },
  tech: { stroke: 'stroke-epi-tech', fill: 'bg-epi-tech' },
  together: { stroke: 'stroke-epi-together', fill: 'bg-epi-together' },
  lavender: { stroke: 'stroke-epi-lavender', fill: 'bg-epi-lavender' },
  drift: {
    stroke: 'stroke-muted-foreground/40',
    fill: 'bg-muted-foreground/40',
  },
  muted: {
    stroke: 'stroke-muted-foreground/25',
    fill: 'bg-muted-foreground/25',
  },
};
