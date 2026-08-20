<script lang="ts" module>
  export type { ColumnDef, SortDir } from './types';
</script>

<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import type { SvelteSet } from 'svelte/reactivity';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import * as Table from '$lib/components/ui/table';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Checkbox } from '$lib/components/ui/checkbox';
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
    onRowClick,
    row,
    empty,
    headerClass = 'bg-muted/50',
    stickyHeader = false,
    layout = 'auto',
    mobileRow,
    mobileSort = true,
    selectable = false,
    selected,
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
     * can replicate. Any interactive element inside a cell (or a `mobileRow`
     * card, which reuses the same overlay) must then carry `relative z-10` to
     * stay clickable above the overlay.
     */
    rowHref?: (row: T) => string;
    /** Accessible name for the row link — the cells are not inside the anchor. */
    rowLabel?: (row: T) => string;
    /**
     * Mouse shortcut: clicking anywhere on the row (or mobile card) runs this.
     * It's a convenience over a real control *inside* the row (e.g. an edit
     * button) which stays the keyboard/AT path, so the row itself takes no
     * role/tabindex. That inner control should `stopPropagation` so the two
     * don't both fire. For navigation prefer `rowHref` (real anchor); use this
     * for JS actions like opening a dialog.
     */
    onRowClick?: (row: T, index: number) => void;
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
    /**
     * Table sizing algorithm. `'auto'` (default) sizes columns to their content
     * — fine for a self-scrolling, full-width table. `'fixed'` makes the table
     * fill exactly its container width and divide it among the columns by their
     * declared widths, so a greedy `w-full` column absorbs the slack and
     * truncates instead of stretching the table past its track. Reach for it
     * when the table lives in a constrained column AND drops its own x-scroll
     * (e.g. a `stickyHeader` table in a grid track): auto layout would let the
     * intrinsic width spill over the neighbour, fixed layout can't.
     */
    layout?: 'auto' | 'fixed';
    /**
     * Opt-in mobile presentation. When set, below `lg` the table is hidden and each
     * row renders as a stacked card through this snippet instead — the desktop table
     * is untouched at `lg+`. The roster table's fixed layout squeezes its columns
     * into nothing on a phone (a 6-column budget can't fit ~400px), so the card list
     * is the readable form there. Leaving it unset keeps the table visible at every
     * width with its own x-scroll, so existing callers are unaffected.
     */
    mobileRow?: Snippet<[T, number]>;
    /** Show the compact "Trier" dropdown above the mobile cards (sortable cols only). */
    mobileSort?: boolean;
    /**
     * Opt-in row selection. Renders a leading checkbox column (desktop + mobile)
     * plus a select-all header box. The parent owns `selected`, keyed by `rowKey`,
     * and renders its own bulk-action bar off `selected.size`; this component only
     * toggles membership. Off by default, so existing callers render exactly as
     * before. Typed `SvelteSet`, not bare `Set`, on purpose: the checkbox state
     * reads `selected.has(...)` and the toggles mutate `selected` in place, so the
     * collection itself must be reactive — a plain `Set` would re-render nothing.
     */
    selectable?: boolean;
    selected?: SvelteSet<string>;
  } = $props();

  const sortableColumns = $derived(columns.filter((c) => c.sortable));
  const activeSortColumn = $derived(columns.find((c) => c.key === sortKey));

  // Render only the layout in use, never both. The old CSS-only `hidden lg:block`
  // / `lg:hidden` toggle kept BOTH the desktop table and the mobile cards in the
  // DOM and hydrated them, doubling every row (and every avatar). Gating on a
  // media query keeps a single tree mounted. SSR — and the first client paint,
  // before `mounted` — renders the desktop table so it matches the server HTML
  // and avoids a hydration mismatch; mobile clients swap to cards right after
  // mount. `lg` = 1024px, the same seam the old classes used. When no `mobileRow`
  // is supplied (e.g. the admin talents table) the desktop table always renders.
  const isDesktop = new MediaQuery('(min-width: 1024px)', true);
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });
  const showDesktop = $derived(!mobileRow || !mounted || isDesktop.current);

  // Selection (opt-in). The parent's `selected` is a reactive Set (a SvelteSet),
  // so mutating it here propagates back without a callback. The index passed to
  // every/some/forEach matches `rowKey(r, i)`.
  const allSelected = $derived(
    selectable &&
      !!selected &&
      rows.length > 0 &&
      rows.every((r, i) => selected.has(rowKey(r, i))),
  );
  const someSelected = $derived(
    selectable &&
      !!selected &&
      !allSelected &&
      rows.some((r, i) => selected.has(rowKey(r, i))),
  );
  function toggleAll(checked: boolean) {
    if (!selected) return;
    rows.forEach((r, i) => {
      const key = rowKey(r, i);
      if (checked) selected.add(key);
      else selected.delete(key);
    });
  }
  function toggleRow(key: string, checked: boolean) {
    if (!selected) return;
    if (checked) selected.add(key);
    else selected.delete(key);
  }
</script>

{#if showDesktop}
  <div class="rounded-sm border bg-card shadow-sm">
    <Table.Root
      class={layout === 'fixed' ? 'table-fixed' : undefined}
      containerClass={stickyHeader ? 'lg:overflow-visible' : undefined}
    >
      <Table.Header class={headerClass}>
        <Table.Row>
          {#if selectable}
            <Table.Head
              class={cn(
                'w-10',
                stickyHeader &&
                  'lg:sticky lg:top-0 lg:z-20 lg:border-b lg:bg-muted',
              )}
            >
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={(v) => toggleAll(v === true)}
                aria-label="Tout sélectionner"
              />
            </Table.Head>
          {/if}
          {#each columns as col (col.key)}
            <Table.Head
              class={cn(
                // Size, weight and case come from Table.Head's overline
                // treatment; only the pinning and alignment are this table's.
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
                    'inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground',
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
            <Table.Cell
              colspan={columns.length + (selectable ? 1 : 0)}
              class="h-32 text-center"
            >
              {#if empty}
                {@render empty()}
              {:else}
                <span class="text-sm text-muted-foreground">Aucun résultat</span
                >
              {/if}
            </Table.Cell>
          </Table.Row>
        {:else}
          {#each rows as r, i (rowKey(r, i))}
            <Table.Row
              class={cn(
                'group/row [&>td]:transition-colors',
                rowHref && 'relative',
                onRowClick && 'cursor-pointer',
              )}
              onclick={onRowClick ? () => onRowClick(r, i) : undefined}
            >
              {#if selectable}
                <Table.Cell class="relative z-10 w-10">
                  <Checkbox
                    checked={selected?.has(rowKey(r, i)) ?? false}
                    onCheckedChange={(v) => toggleRow(rowKey(r, i), v === true)}
                    onclick={(e) => e.stopPropagation()}
                    aria-label="Sélectionner la ligne"
                  />
                </Table.Cell>
              {/if}
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
                  <a href={rowHref(r)} class="block size-full rounded-sm">
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
{/if}

{#if mobileRow && mounted && !isDesktop.current}
  <!-- Mobile (below lg): the fixed table can't fit a phone, so each row becomes a
       card. The header's per-column sort buttons go with it, so an optional "Trier"
       dropdown carries the same sort over (it calls the same `onSort`, which the
       parent already toggles). Cards reuse `rowHref` via the same stretched-link
       overlay as the table rows, so cmd/middle-click and keyboard nav behave alike.
       Gated by `showMobile` (a media query), so on desktop this tree is never
       mounted — the roster renders once, not twice. -->
  <div class="space-y-2">
    {#if mobileSort && onSort && sortableColumns.length > 0}
      <div class="flex items-center justify-end">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            class="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-sm border bg-background px-3 text-xs font-bold uppercase"
            aria-label="Trier la liste"
          >
            <ChevronsUpDown class="h-3.5 w-3.5 text-muted-foreground" />
            Trier{activeSortColumn ? ` : ${activeSortColumn.label}` : ''}
            {#if activeSortColumn}
              {#if sortDir === 'asc'}
                <ArrowUp class="h-3.5 w-3.5 text-epi-blue" />
              {:else}
                <ArrowDown class="h-3.5 w-3.5 text-epi-blue" />
              {/if}
            {/if}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="end">
            {#each sortableColumns as col (col.key)}
              <DropdownMenu.Item
                class="cursor-pointer"
                onSelect={() => onSort?.(col.key)}
              >
                {col.label}
                {#if sortKey === col.key}
                  {#if sortDir === 'asc'}
                    <ArrowUp class="ml-auto h-3.5 w-3.5 text-epi-blue" />
                  {:else}
                    <ArrowDown class="ml-auto h-3.5 w-3.5 text-epi-blue" />
                  {/if}
                {/if}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
    {/if}

    {#if rows.length === 0}
      <div class="rounded-sm border bg-card p-6 text-center shadow-sm">
        {#if empty}
          {@render empty()}
        {:else}
          <span class="text-sm text-muted-foreground">Aucun résultat</span>
        {/if}
      </div>
    {:else}
      {#each rows as r, i (rowKey(r, i))}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class={cn(
            'relative rounded-sm border bg-card p-3 shadow-sm',
            onRowClick && 'cursor-pointer',
          )}
          onclick={onRowClick ? () => onRowClick(r, i) : undefined}
        >
          {#if selectable}
            <div class="relative z-10 mb-2">
              <Checkbox
                checked={selected?.has(rowKey(r, i)) ?? false}
                onCheckedChange={(v) => toggleRow(rowKey(r, i), v === true)}
                onclick={(e) => e.stopPropagation()}
                aria-label="Sélectionner"
              />
            </div>
          {/if}
          {@render mobileRow(r, i)}
          {#if rowHref}
            <a href={rowHref(r)} class="absolute inset-0 rounded-sm">
              <span class="sr-only">{rowLabel?.(r) ?? 'Ouvrir'}</span>
            </a>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
{/if}
