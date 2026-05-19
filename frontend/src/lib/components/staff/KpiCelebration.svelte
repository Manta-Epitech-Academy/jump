<script lang="ts" module>
  import type { KpiTone } from './KpiTile.svelte';
  export type CelebrationTone = Extract<
    KpiTone,
    'blue' | 'orange' | 'teal' | 'pink'
  >;
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
    tone === 'blue'
      ? 'ring-epi-blue'
      : tone === 'orange'
        ? 'ring-epi-orange'
        : tone === 'teal'
          ? 'ring-epi-teal-solid'
          : 'ring-epi-pink',
  );

  const iconColorClass = $derived(
    tone === 'blue'
      ? 'text-epi-blue'
      : tone === 'orange'
        ? 'text-epi-orange'
        : tone === 'teal'
          ? 'text-epi-teal-solid'
          : 'text-epi-pink',
  );

  const Icon = $derived(badgeIcon);
</script>

{#if active}
  <div
    class="animate-celebrate-enter relative h-full rounded-sm ring-2 ring-offset-2 ring-offset-background {ringClass}"
  >
    {@render children()}
    <div
      class="animate-badge-enter absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-sm border border-border bg-background"
    >
      <Icon class="h-4 w-4 {iconColorClass}" />
    </div>
  </div>
{:else}
  {@render children()}
{/if}
