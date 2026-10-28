<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import type { HomeLink, HomePart } from '$lib/domain/eventHome';
  import RingChart from '$lib/components/staff/charts/RingChart.svelte';
  import { CHART_TONE_CLASS } from '$lib/components/staff/charts/chartTone';
  import { cn } from '$lib/utils';
  import HomeCard, { type HomeCardEmpty } from './HomeCard.svelte';

  // A whole in parts: the ring, then its legend, each row of which opens the
  // list filtered on that part. The legend is the control; the ring only
  // pictures it.
  let {
    title,
    parts,
    variant = 'donut',
    figure,
    unit,
    empty,
    hrefOf,
    below,
    footer,
  }: {
    title: string;
    parts: HomePart[];
    variant?: 'donut' | 'pie';
    /** The figure in a donut's middle, with the word under it. */
    figure?: number;
    unit?: string;
    empty?: HomeCardEmpty | null;
    hrefOf: (link: HomeLink) => string | null;
    /** A line under the legend (the feedback's response rate). */
    below?: Snippet;
    footer?: Snippet;
  } = $props();

  const label = $derived(
    `${title} : ${parts.map((p) => `${p.label} ${p.count}`).join(', ')}`,
  );
</script>

{#snippet center()}
  <span class="font-heading text-display-xl leading-none">{figure}</span>
  {#if unit}
    <span class="epi-overline text-muted-foreground">{unit}</span>
  {/if}
{/snippet}

<HomeCard {title} {empty} {footer}>
  <div class="flex flex-col items-center gap-4">
    <RingChart
      {parts}
      {label}
      {variant}
      center={figure === undefined ? undefined : center}
    />
    <ul class="flex w-full flex-col">
      {#each parts as part (part.key)}
        {@const href = hrefOf(part.link)}
        <li>
          <svelte:element
            this={href ? 'a' : 'div'}
            {href}
            class={cn(
              'flex min-h-8 items-center gap-2 rounded-sm px-1.5 text-sm',
              href && 'cursor-pointer transition-colors hover:bg-accent',
            )}
          >
            <span
              aria-hidden="true"
              class={cn(
                'size-2.5 shrink-0 rounded-sm',
                CHART_TONE_CLASS[part.tone].swatch,
              )}
            ></span>
            <span class="min-w-0 flex-1 truncate font-medium">{part.label}</span
            >
            <span class="font-semibold">{part.count}</span>
            <span class="w-10 text-right text-xs text-muted-foreground">
              {part.share}
            </span>
            {#if href}
              <ChevronRight
                class="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            {/if}
          </svelte:element>
        </li>
      {/each}
    </ul>
    {#if below}{@render below()}{/if}
  </div>
</HomeCard>
