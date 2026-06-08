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
    <div class="relative w-full max-w-72">
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
      {@render filters()}
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
