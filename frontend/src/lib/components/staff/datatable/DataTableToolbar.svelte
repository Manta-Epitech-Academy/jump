<script lang="ts">
  import type { Snippet } from 'svelte';
  import Search from '@lucide/svelte/icons/search';
  import { Input } from '$lib/components/ui/input';

  // Search box + filtered-count line + a slot for page-specific filter controls.
  // Debouncing is the caller's concern: the inscrits table filters in memory on
  // every keystroke, while admin talents debounces and navigates with `?q=`.
  let {
    searchValue,
    onSearchInput,
    searchPlaceholder = 'Rechercher…',
    searchWidthClass = 'w-full max-w-72',
    filtersAlign = 'start',
    count,
    countNoun = 'résultat',
    countNounPlural,
    countSuffix,
    filters,
    actions,
    countActions,
  }: {
    searchValue: string;
    onSearchInput: (value: string) => void;
    searchPlaceholder?: string;
    /**
     * Width utilities for the search box wrapper (a flex child of the toolbar
     * row). Defaults to `w-full max-w-72`; pass `flex-1 min-w-0 max-w-…` to let
     * a wide filter cluster share the row instead of forcing the search onto a
     * full line of its own (see émargement).
     */
    searchWidthClass?: string;
    /**
     * `end` pushes the filters to the right edge as one group (space-between
     * against the search box); `start` (default) keeps them inline next to it.
     */
    filtersAlign?: 'start' | 'end';
    count: number;
    countNoun?: string;
    countNounPlural?: string;
    /** Trailing text after the noun, e.g. "correspondent aux filtres". */
    countSuffix?: string;
    /** Page-specific filter controls (segmented filters, selects…). */
    filters?: Snippet;
    /** Optional right-aligned actions on the filter row (e.g. export button). */
    actions?: Snippet;
    /** Optional controls inline with the count line (e.g. reset filters). */
    countActions?: Snippet;
  } = $props();

  const plural = $derived(countNounPlural ?? `${countNoun}s`);
</script>

<div class="space-y-3">
  <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
    <div class="relative {searchWidthClass}">
      <Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={searchPlaceholder}
        class="rounded-sm pl-9"
        value={searchValue}
        oninput={(e) =>
          onSearchInput((e.currentTarget as HTMLInputElement).value)}
      />
    </div>

    {#if filters}
      {#if filtersAlign === 'end'}
        <div class="ml-auto flex flex-wrap items-center gap-x-5 gap-y-3">
          {@render filters()}
        </div>
      {:else}
        {@render filters()}
      {/if}
    {/if}

    {#if actions}
      <div class="ml-auto">
        {@render actions()}
      </div>
    {/if}
  </div>

  <div class="flex flex-wrap items-center gap-3">
    <p class="text-xs text-muted-foreground">
      <span class="font-bold text-foreground">{count}</span>
      {count > 1 ? plural : countNoun}{#if countSuffix}&nbsp;{countSuffix}{/if}
    </p>
    {#if countActions}
      {@render countActions()}
    {/if}
  </div>
</div>
