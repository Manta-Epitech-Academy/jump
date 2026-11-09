import type { ChartTone } from '$lib/domain/chartSeries';

/**
 * A chart tone as classes: the ring's stroke, the disc's fill and the legend's
 * swatch, from the same token so the three can never disagree. Raw accents and
 * their tints, since these are fills and never text (`DESIGN.md`: raw for
 * fills, ink for text under 24px). The order is `CHART_SERIES`'s.
 *
 * `missing` takes the mid grey, two steps darker than `drift`, the light grey
 * every closing screen gives « Indécis »: one step apart, the two read as the
 * same answer.
 */
export const CHART_TONE_CLASS: Record<
  ChartTone,
  { stroke: string; fill: string; swatch: string }
> = {
  blue: {
    stroke: 'stroke-epi-blue',
    fill: 'fill-epi-blue',
    swatch: 'bg-epi-blue',
  },
  tomorrow: {
    stroke: 'stroke-epi-tomorrow',
    fill: 'fill-epi-tomorrow',
    swatch: 'bg-epi-tomorrow',
  },
  tech: {
    stroke: 'stroke-epi-tech',
    fill: 'fill-epi-tech',
    swatch: 'bg-epi-tech',
  },
  together: {
    stroke: 'stroke-epi-together',
    fill: 'fill-epi-together',
    swatch: 'bg-epi-together',
  },
  blueTint: {
    stroke: 'stroke-epi-blue-tint',
    fill: 'fill-epi-blue-tint',
    swatch: 'bg-epi-blue-tint',
  },
  tomorrowTint: {
    stroke: 'stroke-epi-tomorrow-tint',
    fill: 'fill-epi-tomorrow-tint',
    swatch: 'bg-epi-tomorrow-tint',
  },
  techTint: {
    stroke: 'stroke-epi-tech-tint',
    fill: 'fill-epi-tech-tint',
    swatch: 'bg-epi-tech-tint',
  },
  togetherTint: {
    stroke: 'stroke-epi-together-tint',
    fill: 'fill-epi-together-tint',
    swatch: 'bg-epi-together-tint',
  },
  grey: {
    stroke: 'stroke-epi-grey-mid',
    fill: 'fill-epi-grey-mid',
    swatch: 'bg-epi-grey-mid',
  },
  drift: {
    stroke: 'stroke-muted-foreground/40',
    fill: 'fill-muted-foreground/40',
    swatch: 'bg-muted-foreground/40',
  },
  missing: {
    stroke: 'stroke-epi-grey-mid',
    fill: 'fill-epi-grey-mid',
    swatch: 'bg-epi-grey-mid',
  },
};
