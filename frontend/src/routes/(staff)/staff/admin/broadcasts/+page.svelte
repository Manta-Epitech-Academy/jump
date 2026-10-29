<script lang="ts">
  import {
    buildHaystack,
    matchesAllTokens,
    searchTokens,
  } from '$lib/components/staff/datatable/search';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import Plus from '@lucide/svelte/icons/plus';
  import Send from '@lucide/svelte/icons/send';
  import MailCheck from '@lucide/svelte/icons/mail-check';
  import Eye from '@lucide/svelte/icons/eye';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import ActiveFilterChips from '$lib/components/staff/ActiveFilterChips.svelte';
  import type { ColumnDef } from '$lib/components/staff/datatable/types';
  import { facetControls } from '$lib/components/staff/datatable/facetControls';
  import {
    clearListFilters,
    setListParams,
  } from '$lib/components/staff/datatable/urlList';
  import { createUrlSearch } from '$lib/components/staff/datatable/urlSearch.svelte';
  import { listFacets, matchesListFacets } from '$lib/domain/listFacets';
  import BroadcastStatusBadge from '$lib/components/admin/broadcasts/BroadcastStatusBadge.svelte';
  import ChannelBadge from '$lib/components/admin/broadcasts/ChannelBadge.svelte';
  import { BROADCASTS_FACET_DEFS, BROADCASTS_VIEW } from './view';

  let { data } = $props();

  const formatter = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  function pct(v: number | null): string {
    return v == null ? '-' : `${Math.round(v)} %`;
  }

  type Row = (typeof data.broadcasts)[number];

  // ── Client-side filtering over the 50 most recent sends ──────────────────
  // The view lives in the address (`./view`), so a reload or a shared link
  // shows the same list.
  const view = $derived(BROADCASTS_VIEW.parse(page.url.searchParams));
  const search = createUrlSearch();

  const facets = $derived(
    listFacets(
      data.broadcasts,
      BROADCASTS_FACET_DEFS,
      BROADCASTS_VIEW.facets,
      view.facets,
    ),
  );
  const controls = $derived(
    facetControls(facets, (facet, values) =>
      setListParams(BROADCASTS_VIEW.facetParams(facet, values)),
    ),
  );

  const columns = $derived<ColumnDef[]>([
    { key: 'name', label: 'Nom' },
    { key: 'canal', label: 'Canal', filter: controls.filterOf('canal') },
    { key: 'campus', label: 'Campus' },
    { key: 'event', label: 'Event' },
    { key: 'statut', label: 'Statut', filter: controls.filterOf('statut') },
    { key: 'progress', label: 'Progression' },
    { key: 'date', label: 'Date' },
    { key: 'actions', label: '', align: 'right' },
  ]);

  const filtered = $derived.by(() => {
    const tokens = searchTokens(search.value);
    return data.broadcasts.filter(
      (b) =>
        matchesListFacets(b, facets, BROADCASTS_FACET_DEFS) &&
        matchesAllTokens(buildHaystack([b.name]), tokens),
    );
  });

  const anyFiltersApplied = $derived(
    search.value.trim().length > 0 || controls.chips.length > 0,
  );

  // Clears the filters and the search.
  function resetFilters() {
    clearListFilters(BROADCASTS_VIEW.clearedFacetParams(), search);
  }
</script>

{#snippet newBroadcast()}
  <Button href={resolve('/staff/admin/broadcasts/new')}>
    <Plus class="mr-1 h-4 w-4" /> Nouvel envoi
  </Button>
{/snippet}

<div class="space-y-6">
  <PageHeader
    title="Envoi"
    accent="en masse"
    subtitle="Mail / SMS ciblés aux talents, parents ou staff, et suivi d'acheminement"
    actions={newBroadcast}
  />

  <!-- 30-day headline stats -->
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <KpiTile
      label="Envois"
      value={data.stats.totals.broadcasts}
      sub="30 derniers jours"
      icon={Send}
      tone="blue"
    />
    <KpiTile
      label="Messages envoyés"
      value={data.stats.totals.sent}
      sub="30 derniers jours"
      icon={MailCheck}
      tone="teal"
    />
    <KpiTile
      label="Taux d'ouverture"
      value={pct(data.stats.totals.openRate)}
      progress={data.stats.totals.openRate ?? undefined}
      icon={Eye}
      tone="teal"
      helpText="Mails ouverts / mails envoyés (le SMS n'est pas suivi)"
    />
    <KpiTile
      label="Échecs"
      value={data.stats.totals.failed}
      sub="30 derniers jours"
      icon={TriangleAlert}
      tone="orange"
    />
  </div>

  {#if data.broadcasts.length === 0}
    <div
      class="rounded-sm border border-dashed p-10 text-center text-sm text-muted-foreground"
    >
      Aucun envoi pour le moment.
    </div>
  {:else}
    <DataTableToolbar
      searchValue={search.value}
      onSearchInput={(v) => (search.value = v)}
      searchPlaceholder="Rechercher un envoi…"
      count={filtered.length}
      countNoun="envoi"
      filtersApplied={anyFiltersApplied}
    />

    <ActiveFilterChips chips={controls.chips} {search} onReset={resetFilters} />

    <SortableTable {columns} rows={filtered} rowKey={(b: Row) => b.id}>
      {#snippet row(b: Row)}
        {@const total = b._count.recipients}
        {@const sentPct = total > 0 ? (b.progress.sent / total) * 100 : 0}
        <Table.Cell class="font-medium">{b.name}</Table.Cell>
        <Table.Cell><ChannelBadge channel={b.channel} /></Table.Cell>
        <Table.Cell class="text-muted-foreground">{b.campus.name}</Table.Cell>
        <Table.Cell class="text-muted-foreground">
          {b.event?.titre ?? '-'}
        </Table.Cell>
        <Table.Cell><BroadcastStatusBadge status={b.status} /></Table.Cell>
        <Table.Cell class="min-w-40">
          <div class="h-1.5 w-full overflow-hidden rounded-sm bg-muted">
            <div
              class="h-full w-[var(--sent)] bg-epi-tech-ink"
              style:--sent="{sentPct}%"
            ></div>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">
            {b.progress.sent}/{total} envoyés
            {#if b.progress.failed > 0}
              <span class="text-destructive">· {b.progress.failed} échec</span>
            {/if}
            {#if b.progress.opened > 0}
              <span>· {b.progress.opened} ouvert</span>
            {/if}
          </p>
        </Table.Cell>
        <Table.Cell class="text-muted-foreground">
          {formatter.format(b.createdAt)}
        </Table.Cell>
        <Table.Cell class="text-right">
          <Button
            variant="ghost"
            size="sm"
            href={resolve(`/staff/admin/broadcasts/${b.id}`)}
          >
            Détail
          </Button>
        </Table.Cell>
      {/snippet}

      {#snippet empty()}
        <div class="flex flex-col items-center gap-3 py-6">
          <span
            class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            Aucun envoi ne correspond à ces filtres
          </span>
        </div>
      {/snippet}
    </SortableTable>
  {/if}
</div>
