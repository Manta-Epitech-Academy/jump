<script lang="ts">
  import { onMount } from 'svelte';
  import { Skeleton } from '$lib/components/ui/skeleton';

  // Pending placeholder for a streamed results region. Mirrors the two-column
  // results grid (table left, optional rail right) so the shell doesn't reflow
  // when the real content lands. Shared by the streamed staff pages (dev stage
  // tables + admin sf-conflicts); pass `rail={false}` for a single-column list.
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

<div
  class="grid gap-6 transition-opacity duration-200 xl:grid-cols-10"
  class:opacity-0={!visible}
  aria-hidden="true"
>
  <div class="min-w-0 space-y-4 xl:col-span-7">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <Skeleton class="h-9 w-[230px]" />
      <Skeleton class="h-9 w-44" />
    </div>
    <div class="rounded-sm border bg-card shadow-sm">
      <!-- Header bar: the real tables carry a ~40px header row, so reserve it
           here too or the rows pop down a notch when content lands. -->
      <Skeleton class="m-3 h-9 rounded-sm" />
      <div class="space-y-2 px-3 pb-3">
        {#each Array.from({ length: rows }, (_, i) => i) as i (i)}
          <Skeleton class="h-12 w-full" />
        {/each}
      </div>
    </div>
  </div>
  {#if rail}
    <aside class="min-w-0 xl:col-span-3">
      <div class="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <Skeleton class="h-40 w-full" />
        <Skeleton class="h-40 w-full" />
        <Skeleton class="h-40 w-full" />
      </div>
    </aside>
  {/if}
</div>
