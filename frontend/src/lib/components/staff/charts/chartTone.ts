import type { ChartTone } from '#lib/domain/chartSeries.ts';

/**
 * A chart tone as classes: a slice's fill and the legend's swatch, from the
 * same token so the two can never disagree. Raw accents and
 * their tints, since these are fills and never text (`DESIGN.md`: raw for
 * fills, ink for text under 24px). The order is `CHART_SERIES`'s.
 *
 * `missing` takes the mid grey, two steps darker than `drift`, the light grey
 * every closing screen gives « Indécis »: one step apart, the two read as the
 * same answer.
 */
export const CHART_TONE_CLASS: Record<
  ChartTone,
  { fill: string; swatch: string }
> = {
  blue: {
    fill: 'fill-epi-blue',
    swatch: 'bg-epi-blue',
  },
  tomorrow: {
    fill: 'fill-epi-tomorrow',
    swatch: 'bg-epi-tomorrow',
  },
  tech: {
    fill: 'fill-epi-tech',
    swatch: 'bg-epi-tech',
  },
  together: {
    fill: 'fill-epi-together',
    swatch: 'bg-epi-together',
  },
  blueTint: {
    fill: 'fill-epi-blue-tint',
    swatch: 'bg-epi-blue-tint',
  },
  tomorrowTint: {
    fill: 'fill-epi-tomorrow-tint',
    swatch: 'bg-epi-tomorrow-tint',
  },
  techTint: {
    fill: 'fill-epi-tech-tint',
    swatch: 'bg-epi-tech-tint',
  },
  togetherTint: {
    fill: 'fill-epi-together-tint',
    swatch: 'bg-epi-together-tint',
  },
  grey: {
    fill: 'fill-epi-grey-mid',
    swatch: 'bg-epi-grey-mid',
  },
  drift: {
    fill: 'fill-muted-foreground/40',
    swatch: 'bg-muted-foreground/40',
  },
  missing: {
    fill: 'fill-epi-grey-mid',
    swatch: 'bg-epi-grey-mid',
  },
};
