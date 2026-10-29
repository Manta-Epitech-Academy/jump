<script lang="ts" module>
  import type { Component } from 'svelte';
  import type { LucideIcon } from '@lucide/svelte';

  /** What a card shows in place of figures it does not have yet: what is
   *  missing, and where it will come from. */
  export type HomeCardEmpty = {
    icon: LucideIcon | Component;
    title: string;
    hint: string;
  };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as Card from '$lib/components/ui/card';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';

  // One card of the event home: the mockup's mono title ending in the cursor,
  // its figures, and an optional « Voir… » at the foot. A card whose figures
  // are not there yet keeps its place in the grid and says what will fill it,
  // centred in the card, rather than drawing an empty chart.
  let {
    title,
    empty,
    children,
    footer,
  }: {
    title: string;
    empty?: HomeCardEmpty | null;
    children: Snippet;
    footer?: Snippet;
  } = $props();
</script>

<Card.Root class="gap-4 p-6">
  <h2 class="epi-overline text-muted-foreground">{title}<TitleCursor /></h2>
  {#if empty}
    {@const Icon = empty.icon}
    <div
      class="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center"
    >
      <span
        class="flex size-12 items-center justify-center rounded-sm bg-epi-blue/10 text-epi-blue"
      >
        <Icon class="size-6" aria-hidden="true" />
      </span>
      <div class="flex max-w-60 flex-col gap-1">
        <p class="text-sm font-semibold">{empty.title}</p>
        <p class="text-xs text-muted-foreground">{empty.hint}</p>
      </div>
    </div>
  {:else}
    <div class="flex flex-1 flex-col gap-4">{@render children()}</div>
    {#if footer}
      <div class="mt-auto flex justify-center pt-1">{@render footer()}</div>
    {/if}
  {/if}
</Card.Root>
