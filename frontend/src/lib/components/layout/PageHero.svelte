<script lang="ts" module>
  export type PageHeroVariant = 'blue' | 'teal' | 'amber';
</script>

<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import type { Icon as IconType } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  type Props = {
    /** Background gradient flavour. Blue is the workspace default. */
    variant?: PageHeroVariant;
    /**
     * Optional decorative icon rendered top-right with low opacity.
     * Pass any lucide icon component.
     */
    decorationIcon?: typeof IconType | Component;
    /** Vertical padding density. Compact for sub-pages, comfortable for top-level dashboards. */
    density?: 'compact' | 'comfortable';
    /** Extra classes appended to the outer wrapper. */
    class?: string;
    children: Snippet;
  };

  let {
    variant = 'blue',
    decorationIcon,
    density = 'comfortable',
    class: extraClass,
    children,
  }: Props = $props();

  const variantClass = $derived(
    variant === 'teal'
      ? 'bg-linear-to-r from-epi-teal-solid via-teal-700 to-slate-900'
      : variant === 'amber'
        ? 'bg-linear-to-r from-epi-orange via-orange-800 to-slate-900'
        : 'bg-linear-to-r from-epi-blue via-blue-800 to-slate-900',
  );

  const paddingClass = $derived(
    density === 'compact' ? 'px-6 py-6' : 'px-8 py-10',
  );

  const Decoration = $derived(decorationIcon);
</script>

<div
  class={cn(
    'relative overflow-hidden rounded-sm text-white shadow-md dark:shadow-none',
    variantClass,
    paddingClass,
    extraClass,
  )}
>
  {#if Decoration}
    <div
      class="pointer-events-none absolute -top-20 -right-20 opacity-20 mix-blend-overlay"
      aria-hidden="true"
    >
      <Decoration class="h-96 w-96" />
    </div>
  {/if}

  <div class="relative z-10">
    {@render children()}
  </div>
</div>
