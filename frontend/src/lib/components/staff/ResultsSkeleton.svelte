<script lang="ts">
  import { onMount } from 'svelte';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import ResultsLayout from './ResultsLayout.svelte';

  // Pending placeholder for a streamed results region. It occupies the same
  // shape the real content will, through the same `ResultsLayout`, so the shell
  // does not reflow when the cohort lands: it used to redraw that two-column
  // grid itself, which made the match a promise rather than a fact. Shared by
  // the streamed staff pages; pass `rail={false}` for a single-column list.
  let { rows = 10, rail = true }: { rows?: number; rail?: boolean } = $props();

  // Hold the skeleton invisible for a beat before fading it in. The cohort query
  // is a few ms warm, so most navigations resolve well under this threshold: the
  // {#await}/effect swaps the real content in before the skeleton ever paints,
  // which kills the flash-then-jump on warm navigations (the swap reads as a
  // jump precisely because the skeleton is only a rough proxy for the table).
  // The box still occupies its height while invisible, so nothing below shifts;
  // only genuinely slow loads (cold start) cross the threshold and fade in.
  let visible = $state(false);
  onMount(() => {
    const t = setTimeout(() => (visible = true), 180);
    return () => clearTimeout(t);
  });
</script>

{#snippet table()}
  <div class="flex flex-wrap items-center justify-between gap-2">
    <Skeleton class="h-9 w-[230px]" />
    <Skeleton class="h-9 w-44" />
  </div>
  <div class="rounded-sm border bg-card shadow-raised">
    <!-- Header bar: the real tables carry a ~40px header row, so reserve it
         here too or the rows pop down a notch when content lands. -->
    <Skeleton class="m-3 h-9 rounded-sm" />
    <div class="space-y-2 px-3 pb-3">
      {#each Array.from({ length: rows }, (_, i) => i) as i (i)}
        <Skeleton class="h-12 w-full" />
      {/each}
    </div>
  </div>
{/snippet}

{#snippet railCards()}
  <Skeleton class="h-40 w-full" />
  <Skeleton class="h-40 w-full" />
  <Skeleton class="h-40 w-full" />
{/snippet}

<div
  class="transition-opacity duration-200"
  class:opacity-0={!visible}
  aria-hidden="true"
>
  {#if rail}
    <ResultsLayout
      main={table}
      rail={railCards}
      railClass="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-1"
    />
  {:else}
    <!-- No rail: full width, matching a page whose results are not in the
         two-column layout at all (the admin talents and notes directories). The
         grid used to be drawn either way, so those two faded in a 70%-wide
         skeleton and then landed full-width content. -->
    <ResultsLayout main={table} />
  {/if}
</div>
