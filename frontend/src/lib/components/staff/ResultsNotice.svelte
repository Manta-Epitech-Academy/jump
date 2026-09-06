<script lang="ts">
  import type { Component } from 'svelte';
  import type { Icon as IconType } from '@lucide/svelte';

  // The quiet panel every staff list page shows in place of its results: the
  // streamed cohort failed to load, or there is genuinely nothing to list. It
  // used to be copy-pasted at twelve sites, which is how `admin/notes` ended up
  // failing with a bare sentence while its six sibling pages drew a panel.
  //
  // Deliberately NOT `$lib/components/EmptyState.svelte`, which is the loud
  // variant (2px dashed border, pinging halo, display heading): that one invites
  // an action, this one reports a state nobody can act on from here. Both exist
  // on purpose; pick by whether there is something to click.
  let {
    icon: Icon,
    title,
    description,
  }: {
    /** Lucide icon above the title. Omit for a failure, which needs no picture. */
    icon?: typeof IconType | Component;
    /**
     * Overline-styled heading. Omit for a one-line notice, which then renders
     * the description alone at body size instead of as a subtitle.
     */
    title?: string;
    description: string;
  } = $props();
</script>

<div
  class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
>
  {#if Icon}
    <Icon class="h-10 w-10 text-muted-foreground opacity-30" />
  {/if}
  {#if title}
    <h3
      class="text-sm font-bold tracking-widest text-foreground uppercase {Icon
        ? 'mt-4'
        : ''}"
    >
      {title}
    </h3>
    <p class="mt-1 max-w-sm text-xs font-medium text-muted-foreground">
      {description}
    </p>
  {:else}
    <p class="text-sm text-muted-foreground">{description}</p>
  {/if}
</div>
