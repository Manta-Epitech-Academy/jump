<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  type Props = {
    /** Vertical padding density. Compact for sub-pages, comfortable for top-level dashboards. */
    density?: 'compact' | 'comfortable';
    /**
     * The pixel squares in the top-right corner. Off when the content puts
     * something of its own there (a mascot), so the two do not overlap.
     */
    pixels?: boolean;
    /** Extra classes appended to the outer wrapper. */
    class?: string;
    children: Snippet;
  };

  let {
    density = 'comfortable',
    pixels = true,
    class: extraClass,
    children,
  }: Props = $props();

  const paddingClass = $derived(
    density === 'compact' ? 'px-6 py-6' : 'px-8 py-10',
  );
</script>

<!-- Not clipped itself: only the texture is. Content may break out of the
     frame (the talent hero's mascot does), and an `overflow-hidden` here would
     cut it off at the edge. -->
<div
  class={cn(
    // Full-bleed brand blue: the charte's hero surface. There is no
    // variant, and a neon or orange fill here would be a page-sized accent.
    'on-dark relative rounded-sm bg-epi-blue text-white',
    paddingClass,
    extraClass,
  )}
>
  <div
    class="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    aria-hidden="true"
  >
    <!-- Blueprint grid texture (charte signature) -->
    <div class="absolute inset-0 blueprint-grid-inverse"></div>

    {#if pixels}
      <!-- Pixel overlays (translucent squares, charte signature texture) -->
      <div class="absolute top-4 right-4 hidden md:block">
        <div class="absolute top-0 right-0 size-14 bg-white/50"></div>
        <div class="absolute top-0 right-16 h-14 w-7 bg-white/25"></div>
        <div class="absolute top-16 right-0 size-7 bg-white/35"></div>
      </div>
    {/if}
  </div>

  <div class="relative z-10">
    {@render children()}
  </div>
</div>
