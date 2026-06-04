<script lang="ts" module>
  export type { ColumnDef, SortDir } from './types';
</script>

<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import * as Table from '$lib/components/ui/table';
  import { cn } from '$lib/utils';
  import type { ColumnDef, SortDir } from './types';

  // Purely presentational. It renders the header (with clickable sort
  // affordances), the rows, and an empty state — but it never sorts, filters
  // or fetches. The parent owns the data strategy and just hands down the
  // current `sortKey`/`sortDir` plus an `onSort` callback. That keeps the same
  // component serving the in-memory inscrits table and the server-paginated
  // admin talents table without either leaking its strategy in here.
  let {
    columns,
    rows,
    sortKey = null,
    sortDir = 'asc',
    onSort,
    rowKey,
    onRowClick,
    row,
    empty,
    headerClass = 'bg-muted/50',
  }: {
    columns: ColumnDef[];
    rows: T[];
    sortKey?: string | null;
    sortDir?: SortDir;
    onSort?: (key: string) => void;
    /** Stable key per row for the keyed `{#each}`. */
    rowKey: (row: T, index: number) => string;
    /** When set, the whole row is a link to `onRowClick(row)`. */
    onRowClick?: (row: T) => void;
    /** Renders the `<Table.Cell>`s for a row. */
    row: Snippet<[T, number]>;
    /** Optional custom empty state (defaults to a muted "Aucun résultat"). */
    empty?: Snippet;
    headerClass?: string;
  } = $props();
</script>

<div class="rounded-sm border bg-card shadow-sm">
  <Table.Root>
    <Table.Header class={headerClass}>
      <Table.Row>
        {#each columns as col (col.key)}
          <Table.Head
            class={cn(
              'text-xs font-bold uppercase',
              col.align === 'right' && 'text-right',
              col.class,
            )}
            aria-sort={sortKey === col.key
              ? sortDir === 'asc'
                ? 'ascending'
                : 'descending'
              : undefined}
          >
            {#if col.sortable && onSort}
              <button
                type="button"
                onclick={() => onSort?.(col.key)}
                class={cn(
                  'inline-flex cursor-pointer items-center gap-1 uppercase transition-colors hover:text-foreground',
                  col.align === 'right' && 'flex-row-reverse',
                )}
              >
                {col.label}
                {#if sortKey === col.key}
                  {#if sortDir === 'asc'}
                    <ArrowUp class="h-3 w-3 text-epi-blue" />
                  {:else}
                    <ArrowDown class="h-3 w-3 text-epi-blue" />
                  {/if}
                {:else}
                  <ChevronsUpDown class="h-3 w-3 text-muted-foreground/50" />
                {/if}
              </button>
            {:else}
              {col.label}
            {/if}
          </Table.Head>
        {/each}
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#if rows.length === 0}
        <Table.Row>
          <Table.Cell colspan={columns.length} class="h-32 text-center">
            {#if empty}
              {@render empty()}
            {:else}
              <span class="text-sm text-muted-foreground">Aucun résultat</span>
            {/if}
          </Table.Cell>
        </Table.Row>
      {:else}
        {#each rows as r, i (rowKey(r, i))}
          <Table.Row
            class={cn('hover:bg-muted/30', onRowClick && 'cursor-pointer')}
            role={onRowClick ? 'link' : undefined}
            tabindex={onRowClick ? 0 : undefined}
            onclick={onRowClick ? () => onRowClick?.(r) : undefined}
            onkeydown={onRowClick
              ? (e: KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRowClick?.(r);
                  }
                }
              : undefined}
          >
            {@render row(r, i)}
          </Table.Row>
        {/each}
      {/if}
    </Table.Body>
  </Table.Root>
</div>
