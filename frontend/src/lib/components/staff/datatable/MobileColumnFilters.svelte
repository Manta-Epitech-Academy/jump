<script lang="ts">
  import * as Drawer from '$lib/components/ui/drawer';
  import { Button } from '$lib/components/ui/button';
  import Funnel from '@lucide/svelte/icons/funnel';
  import { cn } from '$lib/utils';
  import FilterDrillMenu from './FilterDrillMenu.svelte';
  import type { ColumnDef, NamedFilter } from './types';

  // The header filters of a table that renders as cards, where there is no
  // header to hold them: one drawer listing every filtered column's FacetMenu,
  // the same menus the header funnels open. What the "Trier" dropdown is to the
  // header's sort buttons.
  let {
    columns,
  }: {
    /** The columns that carry a `filter`. */
    columns: ColumnDef[];
  } = $props();

  let open = $state(false);
  const filters = $derived<NamedFilter[]>(
    columns.flatMap((c) =>
      c.filter ? [{ key: c.key, label: c.label, filter: c.filter }] : [],
    ),
  );
  const activeCount = $derived(
    filters.reduce((n, f) => n + f.filter.selected.length, 0),
  );
</script>

<Drawer.Root bind:open>
  <Drawer.Trigger
    class={cn(
      'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border bg-background px-3 text-xs font-bold uppercase',
      activeCount > 0 && 'border-epi-blue text-epi-blue',
    )}
  >
    <Funnel class="h-3.5 w-3.5" />
    Filtrer{activeCount > 0 ? ` (${activeCount})` : ''}
  </Drawer.Trigger>
  <Drawer.Content>
    <Drawer.Header>
      <Drawer.Title>Filtrer la liste</Drawer.Title>
    </Drawer.Header>
    <div class="px-4">
      <FilterDrillMenu {filters} />
    </div>
    <Drawer.Footer>
      <Button onclick={() => (open = false)}>Voir la liste</Button>
    </Drawer.Footer>
  </Drawer.Content>
</Drawer.Root>
