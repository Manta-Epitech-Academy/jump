<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  type Props = {
    /** Vertical padding density. Compact for sub-pages, comfortable for top-level dashboards. */
    density?: 'compact' | 'comfortable';
    /** Extra classes appended to the outer wrapper. */
    class?: string;
    children: Snippet;
  };

  let {
    density = 'comfortable',
    class: extraClass,
    children,
  }: Props = $props();

  const paddingClass = $derived(
    density === 'compact' ? 'px-6 py-6' : 'px-8 py-10',
  );
</script>

<div
  class={cn(
    // Full-bleed brand blue: the charte's hero surface. There is no
    // variant, and a neon or orange fill here would be a page-sized accent.
    'on-dark relative overflow-hidden rounded-sm bg-epi-blue text-white',
    paddingClass,
    extraClass,
  )}
>
  <!-- Blueprint grid texture (charte signature) -->
  <div
    class="pointer-events-none absolute inset-0 blueprint-grid-inverse"
    aria-hidden="true"
  ></div>

  <!-- Pixel overlays — 50%-opacity squares, charte signature texture -->
  <div
    class="pointer-events-none absolute top-4 right-4 hidden md:block"
    aria-hidden="true"
  >
    <div
      class="absolute"
      style="top: 0; right: 0; width: 56px; height: 56px; background: rgba(255,255,255,0.5);"
    ></div>
    <div
      class="absolute"
      style="top: 0; right: 64px; width: 28px; height: 56px; background: rgba(255,255,255,0.25);"
    ></div>
    <div
      class="absolute"
      style="top: 64px; right: 0; width: 28px; height: 28px; background: rgba(255,255,255,0.35);"
    ></div>
  </div>

  <div class="relative z-10">
    {@render children()}
  </div>
</div>
