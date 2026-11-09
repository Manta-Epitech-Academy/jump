<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ChartTone } from '$lib/domain/eventHome';
  import { cn } from '$lib/utils';
  import { CHART_TONE_CLASS } from './chartTone';
  import { pieSlices } from './pieSlices';

  /**
   * Parts of a whole as a ring (`donut`, with room for a figure in its middle)
   * or a full disc (`pie`).
   *
   * The ring is one SVG circle per part, each drawn as a dash of the
   * circumference starting where the previous one stopped, so the parts always
   * close the ring however they round.
   *
   * The disc is drawn as filled slices (`pieSlices`), not as that same circle
   * with a stroke as wide as its diameter: a stroke whose inner edge reaches the
   * centre has no inner edge to cut a dash against, and the browser let the
   * empty track show through a slice near the centre (« Inscrits par genre »,
   * 29/10/2026).
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

  const RADIUS = 50;
  const STROKE = 10;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const arcs = $derived.by(() => {
    const whole = parts.reduce((n, p) => n + p.count, 0);
    let offset = 0;
    return parts.map((p) => {
      const length = whole > 0 ? (p.count / whole) * CIRCUMFERENCE : 0;
      const arc = { ...p, length, offset };
      offset += length;
      return arc;
    });
  });

  // The disc fills the same 120 box the ring is drawn in.
  const slices = $derived(pieSlices(parts, { cx: 60, cy: 60, r: 60 }));
</script>

<div class={cn('relative size-40 shrink-0', className)}>
  <svg viewBox="0 0 120 120" class="size-full" role="img" aria-label={label}>
    {#if variant === 'pie'}
      <circle cx="60" cy="60" r="60" class="fill-muted" />
      {#each slices as slice (slice.key)}
        {#if slice.path === null}
          <circle
            cx="60"
            cy="60"
            r="60"
            class={CHART_TONE_CLASS[slice.tone].fill}
          />
        {:else}
          <path
            d={slice.path}
            stroke-width="1"
            stroke-linejoin="round"
            class={cn('stroke-card', CHART_TONE_CLASS[slice.tone].fill)}
          />
        {/if}
      {/each}
    {:else}
      <g transform="rotate(-90 60 60)">
        <circle
          cx="60"
          cy="60"
          r={RADIUS}
          fill="none"
          stroke-width={STROKE}
          class="stroke-muted"
        />
        {#each arcs as arc (arc.key)}
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke-width={STROKE}
            stroke-dasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
            stroke-dashoffset={-arc.offset}
            class={CHART_TONE_CLASS[arc.tone].stroke}
          />
        {/each}
      </g>
    {/if}
  </svg>
  {#if center && variant === 'donut'}
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      {@render center()}
    </div>
  {/if}
</div>
