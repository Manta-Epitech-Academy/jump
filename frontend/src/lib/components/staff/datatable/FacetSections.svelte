<script lang="ts">
  import FacetMenu from './FacetMenu.svelte';
  import type { NamedFilter } from './types';

  // Several filters listed one under the other, each under its name: the body
  // of the mobile filter drawer and of a toolbar's "Filtres" popover, so the
  // two gather filters the same way.
  let { filters }: { filters: NamedFilter[] } = $props();
</script>

<div class="space-y-3">
  {#each filters as { key, label, filter } (key)}
    <section class="rounded-sm border">
      <h3 class="border-b px-3 py-2 epi-overline text-muted-foreground">
        {label}
      </h3>
      <FacetMenu
        title={label}
        options={filter.options}
        selected={filter.selected}
        onChange={filter.onChange}
      />
    </section>
  {/each}
</div>
