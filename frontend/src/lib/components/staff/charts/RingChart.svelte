<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ChartTone } from '$lib/domain/eventHome';
  import { cn } from '$lib/utils';
  import { CHART_TONE_CLASS } from './chartTone';

  /**
   * Parts of a whole as a ring (`donut`, with room for a figure in its middle)
   * or a full disc (`pie`). One SVG circle per part, each drawn as a dash of the
   * circumference starting where the previous one stopped, so the parts always
   * close the ring however they round. A disc is the same circle with a stroke
   * as wide as its diameter.
   *
   * The ring is a picture of the legend beside it, never the control: it is one
   * image for a screen reader (`label`), and the parts a person clicks are the
   * legend's rows.
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

  // A donut leaves a hole wide enough for its figure and the word under it; a
  // disc's stroke covers to its centre.
  const radius = $derived(variant === 'donut' ? 50 : 30);
  const stroke = $derived(variant === 'donut' ? 10 : 60);
  const circumference = $derived(2 * Math.PI * radius);

  const arcs = $derived.by(() => {
    const whole = parts.reduce((n, p) => n + p.count, 0);
    let offset = 0;
    return parts.map((p) => {
      const length = whole > 0 ? (p.count / whole) * circumference : 0;
      const arc = { ...p, length, offset };
      offset += length;
      return arc;
    });
  });
</script>

<div class={cn('relative size-40 shrink-0', className)}>
  <svg viewBox="0 0 120 120" class="size-full" role="img" aria-label={label}>
    <g transform="rotate(-90 60 60)">
      <circle
        cx="60"
        cy="60"
        r={radius}
        fill="none"
        stroke-width={stroke}
        class="stroke-muted"
      />
      {#each arcs as arc (arc.key)}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke-width={stroke}
          stroke-dasharray={`${arc.length} ${circumference - arc.length}`}
          stroke-dashoffset={-arc.offset}
          class={CHART_TONE_CLASS[arc.tone].stroke}
        />
      {/each}
    </g>
  </svg>
  {#if center && variant === 'donut'}
    <div class="absolute inset-0 flex flex-col items-center justify-center">
      {@render center()}
    </div>
  {/if}
</div>
