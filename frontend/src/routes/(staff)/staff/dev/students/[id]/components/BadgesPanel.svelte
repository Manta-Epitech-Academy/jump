<script lang="ts">
  import type { Component } from 'svelte';
  import Zap from '@lucide/svelte/icons/zap';
  import Medal from '@lucide/svelte/icons/medal';
  import Trophy from '@lucide/svelte/icons/trophy';
  import FileSignature from '@lucide/svelte/icons/file-signature';
  import Compass from '@lucide/svelte/icons/compass';
  import Image from '@lucide/svelte/icons/image';
  import Palette from '@lucide/svelte/icons/palette';
  import Hammer from '@lucide/svelte/icons/hammer';
  import Lock from '@lucide/svelte/icons/lock';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';
  import type { BadgeColor, BadgeIcon, BadgeView } from '$lib/domain/badges';

  type Props = { badges: BadgeView[] };

  let { badges }: Props = $props();

  // Local lookup — CLAUDE.md forbids `@lucide/svelte` barrel imports, so each
  // icon is imported by path and resolved from the badge's string `icon`
  // field. New badges add an entry here and in `BADGES`.
  const ICONS: Record<BadgeIcon, Component<{ class?: string }>> = {
    zap: Zap,
    medal: Medal,
    trophy: Trophy,
    'file-signature': FileSignature,
    compass: Compass,
    image: Image,
    palette: Palette,
    hammer: Hammer,
  };

  const COLOR_CLASS: Record<BadgeColor, string> = {
    'epi-blue': 'bg-epi-blue text-white',
    'epi-teal': 'bg-epi-teal-solid text-white',
    'epi-orange': 'bg-epi-orange text-white',
    'epi-pink': 'bg-epi-pink text-white',
    'epi-black': 'bg-epi-dark text-white dark:ring-1 dark:ring-white/10',
  };
</script>

<div class="grid grid-cols-4 gap-2">
  {#each badges as badge (badge.id)}
    {@const Icon = ICONS[badge.icon]}
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger aria-label={badge.label}>
          <div
            class={cn(
              'relative flex aspect-square flex-col items-center justify-center gap-1 rounded-sm transition-transform',
              badge.earned
                ? cn(
                    COLOR_CLASS[badge.color],
                    'shadow-sm hover:-translate-y-0.5',
                  )
                : 'bg-muted/40 text-muted-foreground/50 dark:bg-muted/20',
            )}
          >
            <Icon class="h-5 w-5" />
            {#if !badge.earned}
              <Lock
                class="absolute top-1 right-1 h-2.5 w-2.5 opacity-60"
                aria-hidden="true"
              />
            {/if}
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content class="max-w-[15rem]">
          <p class="text-[11px] font-bold tracking-widest uppercase">
            {badge.label}
          </p>
          <p class="mt-0.5 text-xs">{badge.description}</p>
          {#if !badge.earned}
            <p
              class="mt-1 font-mono text-[9px] tracking-widest text-muted-foreground uppercase"
            >
              Non débloqué
            </p>
          {/if}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  {/each}
</div>
