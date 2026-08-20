<script lang="ts" module>
  export type PageHeroVariant = 'blue' | 'teal' | 'amber';
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  type Props = {
    /** Background flavour. Blue is the workspace default. */
    variant?: PageHeroVariant;
    /** Vertical padding density. Compact for sub-pages, comfortable for top-level dashboards. */
    density?: 'compact' | 'comfortable';
    /** Extra classes appended to the outer wrapper. */
    class?: string;
    children: Snippet;
  };

  let {
    variant = 'blue',
    density = 'comfortable',
    class: extraClass,
    children,
  }: Props = $props();

  const variantClass = $derived(
    variant === 'teal'
      ? 'bg-epi-tech-ink'
      : variant === 'amber'
        ? 'bg-epi-together'
        : 'bg-epi-blue',
  );

  const paddingClass = $derived(
    density === 'compact' ? 'px-6 py-6' : 'px-8 py-10',
  );
</script>

<div
  class={cn(
    'relative overflow-hidden rounded-sm text-white shadow-md dark:shadow-none',
    variantClass,
    paddingClass,
    extraClass,
  )}
>
  <!-- Blueprint grid texture (charte signature) -->
  <div
    class="pointer-events-none absolute inset-0"
    style="background-image: linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px); background-size: 40px 40px;"
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
