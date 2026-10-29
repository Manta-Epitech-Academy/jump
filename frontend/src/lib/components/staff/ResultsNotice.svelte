<script lang="ts">
  import type { Component } from 'svelte';
  import type { LucideIcon } from '@lucide/svelte';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import { cn } from '$lib/utils';

  // The quiet panel a staff screen shows in place of what it has nothing of
  // yet, or could not load. It used to be copy-pasted at twelve sites, which
  // is how `admin/notes` ended up failing with a bare sentence while its six
  // sibling pages drew a panel.
  //
  // It had a loud twin, `EmptyState` (pinging halo, display heading, a button
  // that grew on hover), kept for a state with something to click. No caller
  // ever passed it an action, and its motion broke DESIGN.md, so it is gone.
  // The control that fills an empty space already sits on the screen; the
  // description names it rather than drawing a second one.
  //
  // The title is the mono overline ending in the charte's cursor, `AUCUNE
  // NOTE_`: a terminal prompt waiting for its first line, which is the brand's
  // own way of saying "nothing yet" where another product would reach for an
  // illustration.
  let {
    icon: Icon,
    title,
    description,
    compact = false,
  }: {
    /** Lucide icon above the title. Omit for a failure, which needs no picture. */
    icon?: LucideIcon | Component;
    /**
     * Overline heading. Omit for a one-line notice, which then renders the
     * description alone at body size instead of as a subtitle.
     */
    title?: string;
    description: string;
    /** Inside a card or a dialog, where the page-sized padding would dwarf it. */
    compact?: boolean;
  } = $props();
</script>

<div
  class={cn(
    'flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 text-center',
    compact ? 'p-6' : 'p-16',
  )}
>
  {#if Icon}
    <Icon
      class={cn(
        'text-muted-foreground opacity-30',
        compact ? 'h-8 w-8' : 'h-10 w-10',
      )}
      aria-hidden="true"
    />
  {/if}
  {#if title}
    <h3
      class={cn(
        'epi-overline text-muted-foreground',
        Icon && (compact ? 'mt-3' : 'mt-4'),
      )}
    >
      {title}<TitleCursor />
    </h3>
    <p class="mt-1 max-w-sm text-xs font-medium text-muted-foreground">
      {description}
    </p>
  {:else}
    <p class="text-sm text-muted-foreground">{description}</p>
  {/if}
</div>
