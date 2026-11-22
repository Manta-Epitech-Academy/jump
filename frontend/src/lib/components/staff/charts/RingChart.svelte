<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ChartTone } from '#lib/domain/chartSeries.ts';
  import { cn } from '#lib/utils.ts';
  import { CHART_TONE_CLASS } from './chartTone';
  import { ringSlices, sectorPath, type RingBox } from './ringSlices';

  /**
   * Parts of a whole as a ring (`donut`, with room for a figure in its middle)
   * or a full disc (`pie`), both cut into filled slices by `ringSlices`, whose
   * doc comment says why neither is a stroked circle any more.
   *
   * Either way it is a picture of the legend beside it, never the control: it
   * is one image for a screen reader (`label`), and the parts a person clicks
   * are the legend's rows.
   */
  let {
    parts,
    label,
    variant = 'donut',
    center,
    class: className,
  }: {
    parts: readonly { key: string; count: number; tone: ChartTone }[];
    /** What the ring shows, read out in place of the picture. */
    label: string;
    variant?: 'donut' | 'pie';
    /** The figure in a donut's middle. */
    center?: Snippet;
    class?: string;
  } = $props();

  // Both fill the same 120 box; the ring is 10 wide, its middle left for the
  // figure.
  const box = $derived<RingBox>(
    variant === 'pie'
      ? { cx: 60, cy: 60, r: 60, inner: 0 }
      : { cx: 60, cy: 60, r: 55, inner: 45 },
  );
  const track = $derived(sectorPath(0, 1, box));
  const slices = $derived(ringSlices(parts, box));
</script>

<div class={cn('relative size-40 shrink-0', className)}>
  <svg viewBox="0 0 120 120" class="size-full" role="img" aria-label={label}>
    <path d={track} class="fill-muted" />
    {#each slices as slice (slice.key)}
      <path
        d={slice.path}
        stroke-width="1"
        stroke-linejoin="round"
        class={cn(
          variant === 'pie' && 'stroke-card',
          CHART_TONE_CLASS[slice.tone].fill,
        )}
      />
    {/each}
  </svg>
  {#if center && variant === 'donut'}
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      {@render center()}
    </div>
  {/if}
</div>
