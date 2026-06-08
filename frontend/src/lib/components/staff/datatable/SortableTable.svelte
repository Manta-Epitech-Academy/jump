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
    rowHref,
    rowLabel,
    row,
    empty,
    headerClass = 'bg-muted/50',
    stickyHeader = false,
  }: {
    columns: ColumnDef[];
    rows: T[];
    sortKey?: string | null;
    sortDir?: SortDir;
    onSort?: (key: string) => void;
    /** Stable key per row for the keyed `{#each}`. */
    rowKey: (row: T, index: number) => string;
    /**
     * When set, the whole row becomes a real link to this href via a stretched
     * anchor overlay. Prefer this over a JS click handler for navigation: a real
     * `<a>` gives cmd/middle/right-click (open in new tab), hover URL preview,
     * native keyboard activation and correct a11y — none of which a row `onclick`
     * can replicate. Any interactive element inside a cell must then carry
     * `relative z-10` to stay clickable above the overlay.
     */
    rowHref?: (row: T) => string;
    /** Accessible name for the row link — the cells are not inside the anchor. */
    rowLabel?: (row: T) => string;
    /** Renders the `<Table.Cell>`s for a row. */
    row: Snippet<[T, number]>;
    /** Optional custom empty state (defaults to a muted "Aucun résultat"). */
    empty?: Snippet;
    headerClass?: string;
    /**
     * Freeze the header as the page scrolls — desktop only (`lg+`). There, the
     * container drops its overflow (`lg:overflow-visible`) so the `<th>`s pin
     * to the page's scroller rather than a wrapping overflow box. Below `lg`
     * the table keeps its contained horizontal scroll (a wide table would
     * otherwise overflow the page sideways on mobile) and the header is normal.
     */
    stickyHeader?: boolean;
  } = $props();
</script>

<div class="rounded-sm border bg-card shadow-sm">
  <Table.Root containerClass={stickyHeader ? 'lg:overflow-visible' : undefined}>
    <Table.Header class={headerClass}>
      <Table.Row>
        {#each columns as col (col.key)}
          <Table.Head
            class={cn(
              'text-xs font-bold uppercase',
              // Pinned header (desktop): each th carries its own opaque fill +
              // bottom border so the frozen bar reads as one line while rows
              // scroll under it (z above the body cells and the stretched row
              // link). Gated to lg — on mobile the table x-scrolls in its box.
              stickyHeader &&
                'lg:sticky lg:top-0 lg:z-20 lg:border-b lg:bg-muted',
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
            class={cn('[&>td]:transition-colors', rowHref && 'relative')}
          >
            {@render row(r, i)}
            {#if rowHref}
              <!-- Stretched-link overlay: a real <a> covering the whole row,
                   inset-0 resolving against the relative <tr>. The browser wraps
                   this absolutely-positioned <td> in an anonymous table cell, so
                   it DOES claim a column — it MUST be rendered last, otherwise
                   that phantom (zero-width) column lands at the front and shifts
                   every real cell one column right of its header. As the trailing
                   cell the phantom column sits past the last header, invisible.
                   It MUST stay transparent: the row-hover rule tints every <td>,
                   and this one sits above the cells, so otherwise it paints a
                   muted sheet over the row's text on hover. Focus shows an inset
                   ring, no fill. -->
              <td class="absolute inset-0 bg-transparent! p-0">
                <a
                  href={rowHref(r)}
                  class="block size-full rounded-sm focus-visible:ring-2 focus-visible:ring-epi-blue focus-visible:outline-none focus-visible:ring-inset"
                >
                  <span class="sr-only">{rowLabel?.(r) ?? 'Ouvrir'}</span>
                </a>
              </td>
            {/if}
          </Table.Row>
        {/each}
      {/if}
    </Table.Body>
  </Table.Root>
</div>
