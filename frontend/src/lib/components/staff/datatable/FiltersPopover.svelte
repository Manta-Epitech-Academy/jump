<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import Funnel from '@lucide/svelte/icons/funnel';
  import { cn } from '$lib/utils';
  import FacetSections from './FacetSections.svelte';
  import type { NamedFilter } from './types';

  // The filters a table offers without a column to hold them (the Inscrits'
  // perso interests, closing and recommendation), behind one "Filtres" control
  // of the toolbar. A column's own filter stays in its header: this is only for
  // a facet worth narrowing on but not worth a column's width on every row.
  let { filters }: { filters: NamedFilter[] } = $props();

  let open = $state(false);
  const activeCount = $derived(
    filters.reduce((n, f) => n + f.filter.selected.length, 0),
  );
</script>

{#if filters.length > 0}
  <Popover.Root bind:open>
    <Popover.Trigger
      class={cn(
        'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border bg-background px-3 text-sm font-bold uppercase shadow-raised',
        activeCount > 0 && 'border-epi-blue text-epi-blue',
      )}
    >
      <Funnel class="h-4 w-4" />
      Filtres{activeCount > 0 ? ` (${activeCount})` : ''}
    </Popover.Trigger>
    <Popover.Content class="max-h-[70vh] w-72 overflow-y-auto p-3" align="end">
      <FacetSections {filters} />
    </Popover.Content>
  </Popover.Root>
{/if}
