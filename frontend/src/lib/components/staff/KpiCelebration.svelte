<script lang="ts" module>
  import type { KpiTone } from './KpiTile.svelte';
  export type CelebrationTone = Extract<KpiTone, 'orange' | 'teal' | 'pink'>;
</script>

<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import type { Icon as IconType } from '@lucide/svelte';

  type Props = {
    /** When true, wrap children with the celebratory ring + badge. */
    active: boolean;
    /** Drives the ring + badge colour. Matches `KpiTile`'s tone. */
    tone: CelebrationTone;
    /** Lucide icon rendered inside the floating square badge. */
    badgeIcon: typeof IconType | Component;
    children: Snippet;
  };

  let { active, tone, badgeIcon, children }: Props = $props();

  // Brand-palette only. Each tone keeps the same hue used by KpiTile.
  const ringClass = $derived(
    tone === 'orange'
      ? 'ring-epi-orange'
      : tone === 'teal'
        ? 'ring-epi-teal-solid'
        : 'ring-epi-pink',
  );

  const iconColorClass = $derived(
    tone === 'orange'
      ? 'text-epi-orange'
      : tone === 'teal'
        ? 'text-epi-teal-solid'
        : 'text-epi-pink',
  );

  const Icon = $derived(badgeIcon);
</script>

{#if active}
  <div
    class="relative h-full animate-in rounded-sm ring-2 ring-offset-2 ring-offset-background duration-300 zoom-in-95 fade-in {ringClass}"
  >
    {@render children()}
    <div
      class="absolute -top-2 -right-2 flex h-7 w-7 animate-in items-center justify-center rounded-sm border border-border bg-background duration-300 fade-in slide-in-from-top-1"
    >
      <Icon class="h-4 w-4 {iconColorClass}" />
    </div>
  </div>
{:else}
  {@render children()}
{/if}
