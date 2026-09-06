<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  // The 70/30 split every stage-seconde dev page and its skeleton draw: the
  // working list on the left, a glanceable rail on the right. Written out at
  // five sites before this, including inside `ResultsSkeleton`, whose whole job
  // is to occupy the same shape so nothing reflows when the cohort lands - a
  // mirror that could only stay true by hand.
  //
  // Two details here are load-bearing and were the reason to share it rather
  // than let each page keep its own copy:
  //
  // `min-w-0` on both columns. As grid items they default to `min-width: auto`,
  // which refuses to shrink below the table's intrinsic (6-column) width and
  // blows the whole grid past the viewport. With `min-w-0` the column shrinks to
  // its track and the table's own fixed layout divides that track up instead.
  //
  // The split is held back to `xl`, not `lg`: a six-column roster plus the rail
  // does not fit side by side on a laptop once the app sidebar and the page
  // padding are taken out. Below `xl` the list takes the full width and the rail
  // drops beneath it, which also puts the content first - the search and the
  // list are what you opened the page for.
  let {
    main,
    rail,
    railClass,
  }: {
    main: Snippet;
    /** Omit for a full-width list (no rail, no grid). */
    rail?: Snippet;
    /**
     * How the rail lays its own cards out, e.g.
     * `grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1`.
     * Deliberately the page's business and not this component's: the card counts
     * differ (émargement carries two, inscrits and closings three), so a shared
     * value would leave one of them with an empty column. What is shared is the
     * sticky box those cards sit in.
     */
    railClass?: string;
  } = $props();
</script>

{#if rail}
  <div class="grid gap-6 xl:grid-cols-10">
    <div class="min-w-0 space-y-4 xl:col-span-7">
      {@render main()}
    </div>
    <!-- Pinned at `xl` with its own scroll, so a rail taller than the screen
         keeps its tail reachable instead of clipping it. -->
    <aside class="min-w-0 xl:col-span-3">
      <div
        class={cn(
          'xl:sticky xl:top-6 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:pr-1',
          railClass,
        )}
      >
        {@render rail()}
      </div>
    </aside>
  </div>
{:else}
  <div class="space-y-4">
    {@render main()}
  </div>
{/if}
