<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import Funnel from '@lucide/svelte/icons/funnel';
  import { cn } from '$lib/utils';
  import FacetMenu from './FacetMenu.svelte';
  import type { ColumnFilter } from './types';

  // A column header's filter: the funnel that opens the column's FacetMenu.
  // On a column that only filters, the label itself is the button (`withLabel`),
  // the way a sortable column's label is its sort button; beside a sort button
  // it is the funnel alone. Active, it turns the accent and shows how many
  // values are ticked, so a filtered column reads as filtered from the header.
  let {
    title,
    filter,
    withLabel = false,
  }: {
    /** The column's label. */
    title: string;
    filter: ColumnFilter;
    withLabel?: boolean;
  } = $props();

  let open = $state(false);
  const active = $derived(filter.selected.length > 0);
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        aria-label={withLabel
          ? undefined
          : `Filtrer par ${title.toLowerCase()}`}
        class={cn(
          // `epi-overline` again, for the reason the sort button gives: a
          // <button> does not inherit the header's uppercase.
          'inline-flex cursor-pointer items-center gap-1 epi-overline transition-colors hover:text-foreground',
          active && 'text-epi-blue hover:text-epi-blue',
        )}
      >
        {#if withLabel}{title}{/if}
        <!-- The count sits on the funnel rather than beside it, so an active
             filter costs its column no width: a roster's columns are budgeted
             to fit the page. -->
        <span class="relative inline-flex">
          <Funnel class="size-3" />
          {#if active}
            <span
              class="absolute -top-2 -right-3 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-epi-blue px-1 text-xs font-bold tracking-normal text-primary-foreground tabular-nums"
            >
              {filter.selected.length}
            </span>
          {/if}
        </span>
      </button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-64 p-0" align="start">
    <FacetMenu
      {title}
      options={filter.options}
      selected={filter.selected}
      onChange={filter.onChange}
      onDone={() => (open = false)}
    />
  </Popover.Content>
</Popover.Root>
