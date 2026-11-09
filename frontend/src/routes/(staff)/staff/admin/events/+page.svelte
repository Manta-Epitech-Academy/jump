<script lang="ts">
  import {
    buildHaystack,
    matchesAllTokens,
    searchTokens,
  } from '$lib/components/staff/datatable/search';
  import Database from '@lucide/svelte/icons/database';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import EventModulesCell from '$lib/components/events/EventModulesCell.svelte';
  import EventStateBadge from '$lib/components/events/EventStateBadge.svelte';
  import AdminSfStatusInspectorDialog from '$lib/components/events/AdminSfStatusInspectorDialog.svelte';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import type {
    ActiveFilterChip,
    ColumnDef,
  } from '$lib/components/staff/datatable/types';
  import { type SegmentOption } from '$lib/components/staff/SegmentedFilter.svelte';
  import FilterSelect from '$lib/components/staff/FilterSelect.svelte';
  import ActiveFilterChips from '$lib/components/staff/ActiveFilterChips.svelte';
  import { facetControls } from '$lib/components/staff/datatable/facetControls';
  import {
    clearListFilters,
    setListParams,
  } from '$lib/components/staff/datatable/urlList';
  import { createUrlSearch } from '$lib/components/staff/datatable/urlSearch.svelte';
  import { listFacets, matchesListFacets } from '$lib/domain/listFacets';
  import {
    EVENT_PERIOD,
    EVENTS_FACET_DEFS,
    EVENTS_SORT_DEFAULT_DIR,
    EVENTS_VIEW,
    type EventPeriod,
    type EventsSortKey,
  } from './view';
  import {
    isEventToPrepare,
    type EventConfigState,
  } from '$lib/domain/eventReadiness';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import { page } from '$app/state';
  import type { AdminEventVM } from './+page.server';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { nextSort } from '$lib/components/staff/datatable/sort';

  let { data } = $props();

  // ─── Filters + sort (in-memory over the full event list) ──────────────────
  // The view lives in the address (`./view`), so a reload or a shared link
  // shows the same list. The bare address is the forward-looking view: across
  // hundreds of events the admin's job is preparing what's coming, not
  // scrolling the past graveyard.
  const view = $derived(EVENTS_VIEW.parse(page.url.searchParams));
  const period = $derived(EVENT_PERIOD.parse(page.url.searchParams));
  const search = createUrlSearch();

  const facets = $derived(
    listFacets(data.events, EVENTS_FACET_DEFS, EVENTS_VIEW.facets, view.facets),
  );
  const controls = $derived(
    facetControls(facets, (facet, values) =>
      setListParams(EVENTS_VIEW.facetParams(facet, values)),
    ),
  );

  const yearOptions = $derived.by<SegmentOption[]>(() => {
    const seen = new Map<string, number>();
    for (const e of data.events) seen.set(e.schoolYearLabel, e.schoolYearStart);
    const years = [...seen]
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => ({ value: label, label }));
    return [{ value: 'all', label: 'Toutes les années' }, ...years];
  });
  // A year the list does not hold (a link from last year) reads as every year.
  const year = $derived.by(() => {
    const raw = page.url.searchParams.get('annee');
    return yearOptions.some((o) => o.value === raw && raw !== 'all')
      ? (raw as string)
      : 'all';
  });

  // One control per column: the campus filters from its header, the others
  // sort.
  const columns = $derived.by<ColumnDef[]>(() => {
    const sortable = (key: EventsSortKey) => ({
      key,
      sortable: true,
      defaultSortDir: EVENTS_SORT_DEFAULT_DIR[key],
    });
    return [
      { ...sortable('name'), label: 'Événement', class: 'w-full' },
      { ...sortable('state'), label: 'État', class: 'w-36' },
      {
        key: 'campus',
        label: 'Campus',
        class: 'w-40',
        filter: controls.filterOf('campus'),
      },
      { ...sortable('date'), label: 'Dates', class: 'w-44' },
      { key: 'modules', label: 'Modules', class: 'w-60' },
      {
        ...sortable('participations'),
        label: 'Inscrits',
        align: 'right',
        class: 'w-24',
      },
      { key: 'actions', label: '', align: 'right', class: 'w-12' },
    ];
  });

  // Sort "État" most-work-first: à configurer, then prêt à publier, then visible.
  const STATE_RANK: Record<EventConfigState, number> = {
    unconfigured: 0,
    ready: 1,
    shown: 2,
  };

  function toggleSort(key: string) {
    const next = nextSort<EventsSortKey>(
      columns,
      { key: view.sort, dir: view.dir },
      key,
    );
    setListParams(EVENTS_VIEW.sortParams(next.key, next.dir));
  }

  function compareEvents(
    a: AdminEventVM,
    b: AdminEventVM,
    key: EventsSortKey,
  ): number {
    switch (key) {
      case 'name':
        return a.displayName.localeCompare(b.displayName, 'fr');
      case 'state':
        return STATE_RANK[a.configState] - STATE_RANK[b.configState];
      case 'date':
        return a.dateTs - b.dateTs;
      case 'participations':
        return a.participations - b.participations;
    }
  }

  // Everything except the window: drives both the KPI tile counts (each tile
  // shows its bucket within the current campus/year/search scope) and, once
  // the window is applied, the table rows.
  const baseFiltered = $derived.by(() => {
    const tokens = searchTokens(search.value);
    return data.events.filter((e) => {
      if (!matchesListFacets(e, facets, EVENTS_FACET_DEFS)) return false;
      if (year !== 'all' && e.schoolYearLabel !== year) return false;
      return matchesAllTokens(
        buildHaystack([e.displayName, e.titre, e.campusName]),
        tokens,
      );
    });
  });

  function matchesPeriod(e: AdminEventVM): boolean {
    switch (period) {
      case 'upcoming':
        return e.status === 'upcoming';
      case 'ongoing':
        return e.status === 'ongoing';
      case 'prep':
        return isEventToPrepare({
          status: e.status,
          configState: e.configState,
        });
      case 'all':
        return true;
    }
  }

  const rows = $derived.by(() => {
    const out = baseFiltered.filter(matchesPeriod);
    out.sort((a, b) => {
      const c = compareEvents(a, b, view.sort);
      return view.dir === 'asc' ? c : -c;
    });
    return out;
  });

  const stats = $derived.by(() => {
    let upcoming = 0;
    let ongoing = 0;
    let prep = 0;
    let inscrUpcoming = 0;
    let inscrTotal = 0;
    for (const e of baseFiltered) {
      inscrTotal += e.participations;
      if (e.status === 'upcoming') {
        upcoming++;
        inscrUpcoming += e.participations;
      } else if (e.status === 'ongoing') {
        ongoing++;
      }
      if (isEventToPrepare({ status: e.status, configState: e.configState }))
        prep++;
    }
    return {
      upcoming,
      ongoing,
      prep,
      all: baseFiltered.length,
      inscrUpcoming,
      inscrTotal,
    };
  });

  // What each window is called: on its tile, in its chip, and as the end of
  // the count line ("12 événements à venir").
  const PERIODS: Record<EventPeriod, { tile: string; count: string }> = {
    upcoming: { tile: 'À venir', count: 'à venir' },
    ongoing: { tile: 'En cours', count: 'en cours' },
    prep: { tile: 'À préparer', count: 'à préparer' },
    all: { tile: 'Tous', count: 'au total' },
  };

  const chips = $derived<ActiveFilterChip[]>([
    ...(period === EVENT_PERIOD.defaultValue
      ? []
      : [
          {
            id: `periode:${period}`,
            facet: 'Période',
            label: PERIODS[period].tile,
            onRemove: () =>
              setListParams(EVENT_PERIOD.params(EVENT_PERIOD.defaultValue)),
          },
        ]),
    ...controls.chips,
    ...(year === 'all'
      ? []
      : [
          {
            id: `annee:${year}`,
            facet: 'Année',
            label: year,
            onRemove: () => setListParams({ annee: '' }),
          },
        ]),
  ]);

  const scopeFiltersApplied = $derived(
    search.value.trim().length > 0 ||
      controls.chips.length > 0 ||
      year !== 'all',
  );
  const anyFiltersApplied = $derived(
    chips.length > 0 || search.value.trim().length > 0,
  );
  const countSuffix = $derived(
    PERIODS[period].count + (scopeFiltersApplied ? ' (filtrés)' : ''),
  );

  // Clears the filters, the window and the search, keeps the sort.
  function resetFilters() {
    clearListFilters(
      {
        ...EVENTS_VIEW.clearedFacetParams(),
        annee: '',
        ...EVENT_PERIOD.params(EVENT_PERIOD.defaultValue),
      },
      search,
    );
  }

  // ─── Inspector dialog ───────────────────────────────────────────────────
  // Who an event shows and masks, by Salesforce status: names and schools, so a
  // read that stays on a screen (the admin API answers with counts only).
  let inspectorOpen = $state(false);
  let inspectingEventId = $state<string | null>(null);
  let inspectingEventTitle = $state<string>('');

  function openInspector(e: AdminEventVM) {
    inspectingEventId = e.id;
    inspectingEventTitle = e.displayName;
    inspectorOpen = true;
  }
</script>

<svelte:head><title>Événements</title></svelte:head>

<div class="space-y-6">
  <div>
    <PageHeader
      accent="Événements"
      subtitle="Où en est chaque événement, de sa configuration à sa publication"
    />
  </div>

  <!-- Cockpit band: each tile is a status filter (click to scope the table),
       counted within the current campus/year/type/search selection. -->
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <KpiTile
      label={PERIODS.upcoming.tile}
      value={stats.upcoming}
      sub={`${stats.inscrUpcoming} inscrits`}
      icon={CalendarClock}
      tone="blue"
      pressed={period === 'upcoming'}
      onclick={() => setListParams(EVENT_PERIOD.params('upcoming'))}
    />
    <KpiTile
      label={PERIODS.ongoing.tile}
      value={stats.ongoing}
      icon={CircleDot}
      tone="teal"
      pressed={period === 'ongoing'}
      onclick={() => setListParams(EVENT_PERIOD.params('ongoing'))}
    />
    <KpiTile
      label={PERIODS.prep.tile}
      value={stats.prep}
      icon={TriangleAlert}
      tone="orange"
      helpText="Événements à venir ou en cours pas encore visibles dans l'espace dev : à configurer ou à publier."
      pressed={period === 'prep'}
      onclick={() => setListParams(EVENT_PERIOD.params('prep'))}
    />
    <KpiTile
      label={PERIODS.all.tile}
      value={stats.all}
      sub={`${stats.inscrTotal} inscrits`}
      icon={CalendarDays}
      tone="neutral"
      pressed={period === 'all'}
      onclick={() => setListParams(EVENT_PERIOD.params('all'))}
    />
  </div>

  <DataTableToolbar
    searchValue={search.value}
    onSearchInput={(v) => (search.value = v)}
    searchPlaceholder="Rechercher un événement…"
    filtersAlign="end"
    count={rows.length}
    countNoun="événement"
    {countSuffix}
  >
    {#snippet filters()}
      <FilterSelect
        ariaLabel="Filtrer par année scolaire"
        options={yearOptions}
        value={year}
        onChange={(v) => setListParams({ annee: v === 'all' ? '' : v })}
      />
    {/snippet}
  </DataTableToolbar>

  <ActiveFilterChips {chips} {search} onReset={resetFilters} />

  <SortableTable
    onResetFilters={anyFiltersApplied ? resetFilters : undefined}
    {columns}
    {rows}
    sortKey={view.sort}
    sortDir={view.dir}
    onSort={toggleSort}
    rowKey={(e) => e.id}
    onRowClick={(e) => openInspector(e)}
    stickyHeader
  >
    {#snippet row(e: AdminEventVM)}
      <Table.Cell>
        <div class="flex items-center gap-2">
          <span class="truncate font-bold" title={e.displayName}>
            {e.displayName}
          </span>
          {#if !e.synced}
            <Badge
              variant="outline"
              class="shrink-0 text-xs font-normal text-muted-foreground"
            >
              Manuel
            </Badge>
          {/if}
        </div>
        {#if e.publicName}
          <span class="block truncate text-xs text-muted-foreground">
            {e.titre}
          </span>
        {/if}
      </Table.Cell>
      <Table.Cell>
        <EventStateBadge state={e.configState} past={e.status === 'past'} />
      </Table.Cell>
      <Table.Cell class="text-muted-foreground">{e.campusName}</Table.Cell>
      <Table.Cell class="text-xs text-muted-foreground">
        {e.dateLabel}{e.startTime ? ` · ${e.startTime}` : ''}
      </Table.Cell>
      <Table.Cell>
        <EventModulesCell modules={e.modules} />
      </Table.Cell>
      <Table.Cell class="text-right">{e.participations}</Table.Cell>
      <Table.Cell class="text-right">
        <div class="flex items-center justify-end gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            class="text-muted-foreground opacity-60 transition-opacity group-hover/row:opacity-100"
            onclick={(ev) => {
              ev.stopPropagation();
              openInspector(e);
            }}
            title="Inspecter les statuts Salesforce de cet événement"
            aria-label="Inspecter les statuts Salesforce de {e.displayName}"
          >
            <Database class="h-4 w-4" />
          </Button>
        </div>
      </Table.Cell>
    {/snippet}

    {#snippet mobileRow(e: AdminEventVM)}
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="truncate font-bold">{e.displayName}</p>
            {#if !e.synced}
              <Badge
                variant="outline"
                class="shrink-0 text-xs font-normal text-muted-foreground"
              >
                Manuel
              </Badge>
            {/if}
          </div>
          <p class="truncate text-xs text-muted-foreground">
            {e.campusName} · {e.dateLabel}
          </p>
        </div>
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            class="relative z-10 shrink-0 text-muted-foreground"
            onclick={(ev) => {
              ev.stopPropagation();
              openInspector(e);
            }}
            title="Inspecter les statuts Salesforce"
            aria-label="Inspecter les statuts Salesforce de {e.displayName}"
          >
            <Database class="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-2">
        <EventModulesCell modules={e.modules} />
        <EventStateBadge state={e.configState} past={e.status === 'past'} />
        <span class="ml-auto text-xs text-muted-foreground">
          {e.participations} inscrits
        </span>
      </div>
    {/snippet}
  </SortableTable>

  <AdminSfStatusInspectorDialog
    bind:open={inspectorOpen}
    eventId={inspectingEventId}
    eventTitle={inspectingEventTitle}
  />
</div>
