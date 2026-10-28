<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as Card from '$lib/components/ui/card';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';

  // One card of the event home: the mockup's mono title ending in the cursor,
  // its figures, and an optional « Voir… » at the foot. A card whose figures
  // are missing says so in one sentence (`empty`) rather than drawing an empty
  // chart.
  let {
    title,
    empty,
    children,
    footer,
  }: {
    title: string;
    /** The sentence shown in place of the figures, when there are none. */
    empty?: string | null;
    children: Snippet;
    footer?: Snippet;
  } = $props();
</script>

<Card.Root class="gap-4 p-6">
  <h2 class="epi-overline text-muted-foreground">{title}<TitleCursor /></h2>
  {#if empty}
    <p class="text-sm text-muted-foreground italic">{empty}</p>
  {:else}
    <div class="flex flex-1 flex-col gap-4">{@render children()}</div>
    {#if footer}
      <div class="mt-auto flex justify-center pt-1">{@render footer()}</div>
    {/if}
  {/if}
</Card.Root>
