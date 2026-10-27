<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import FacetMenu from './FacetMenu.svelte';
  import type { NamedFilter } from './types';

  // Several filters behind one control, one at a time: the list of what can be
  // filtered, and a click opens that filter's own FacetMenu, the very menu a
  // column header opens, with a way back. It holds the toolbar's "Filtres" and
  // the cards' "Filtrer" drawer, so a filter looks and behaves the same
  // wherever it is reached from.
  let {
    filters,
    onDone,
  }: {
    filters: NamedFilter[];
    /** Closes the surface holding the menu (the FacetMenu's "OK"). */
    onDone?: () => void;
  } = $props();

  let openKey = $state<string | null>(null);
  const current = $derived(filters.find((f) => f.key === openKey) ?? null);
</script>

{#if current}
  <button
    type="button"
    onclick={() => (openKey = null)}
    class="flex w-full cursor-pointer items-center gap-1 border-b px-2 py-2 epi-overline text-muted-foreground transition-colors hover:text-foreground"
  >
    <ChevronLeft class="size-4" />
    {current.label}
  </button>
  <FacetMenu
    title={current.label}
    options={current.filter.options}
    selected={current.filter.selected}
    onChange={current.filter.onChange}
    {onDone}
  />
{:else}
  <ul class="py-1">
    {#each filters as { key, label, filter } (key)}
      <li>
        <button
          type="button"
          onclick={() => (openKey = key)}
          class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
        >
          <span class="flex-1">{label}</span>
          {#if filter.selected.length > 0}
            <span
              class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-epi-blue px-1.5 text-xs font-bold text-primary-foreground tabular-nums"
            >
              {filter.selected.length}
            </span>
          {/if}
          <ChevronRight class="size-4 text-muted-foreground" />
        </button>
      </li>
    {/each}
  </ul>
{/if}
