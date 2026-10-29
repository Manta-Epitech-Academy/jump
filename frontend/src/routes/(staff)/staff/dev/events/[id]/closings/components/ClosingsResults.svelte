<script lang="ts">
  import { noMatchLine } from '$lib/domain/devVoice';
  import { page } from '$app/state';
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import Circle from '@lucide/svelte/icons/circle';
  import * as Table from '$lib/components/ui/table';
  import { cn } from '$lib/utils';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import ResultsLayout from '$lib/components/staff/ResultsLayout.svelte';
  import EmptyCohortNotice from '$lib/components/dev/EmptyCohortNotice.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import type { ColumnDef } from '$lib/components/staff/datatable/types';
  import { setListParams } from '$lib/components/staff/datatable/urlList';
  import { createUrlSearch } from '$lib/components/staff/datatable/urlSearch.svelte';
  import ActiveFilterChips, {
    type ActiveFilterChip,
  } from '$lib/components/staff/ActiveFilterChips.svelte';
  import ClosingVerdictChip from '$lib/components/dev/closings/ClosingVerdictChip.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import { resolve } from '$app/paths';
  import * as Avatar from '$lib/components/ui/avatar';
  import { getInitials } from '$lib/avatar';
  import { formatGivenName } from '$lib/domain/profile';
  import { cohortNounForms } from '$lib/domain/event';
  import {
    CLOSING_STATUS_LABELS,
    type ClosingListStatus,
  } from '$lib/domain/closing';
  import {
    CLOSINGS_SORT_DEFAULT_DIR,
    closingsClearedFacetParams,
    closingsFacetParams,
    closingsSortParams,
    parseClosingsView,
    type ClosingsFacet,
    type ClosingsSortKey,
  } from '$lib/domain/closingsView';
  import {
    NOT_CONDUCTED_LABEL,
    closingVerdict,
    closingsFacets,
    conductorLabel,
    matchesClosingsFacets,
    type ClosingsFacetState,
  } from '$lib/domain/closingsRoster';
  import type { ClosingRow, ClosingsCohort } from './types';
  import SynthesisCard from './SynthesisCard.svelte';
  import StaffTallyCard from './StaffTallyCard.svelte';
  import GuideCard from '$lib/components/dev/closings/GuideCard.svelte';
  import {
    statusBadgeClass,
    type StatusTone,
  } from '$lib/components/staff/statusBadge';
  import {
    buildHaystack,
    matchesAllTokens,
    searchTokens,
  } from '$lib/components/staff/datatable/search';
  import {
    nextSort,
    rowComparator,
  } from '$lib/components/staff/datatable/sort';

  // The streamed cohort payload plus the two cheap shell values the table/rail
  // need (timezone for date formatting, currentStaffId to highlight the leader-
  // board). This component owns all sort/filter state, so it mounts only once the
  // data resolves and is the single home for the data-dependent UI.
  let {
    rows,
    counts,
    recoCounts,
    topStaff,
    total,
    eventId,
    cohortNoun,
    timezone,
    currentStaffId,
  }: ClosingsCohort & {
    eventId: string;
    cohortNoun: string | null;
    timezone: string;
    currentStaffId: string | null;
  } = $props();

  // Event's Jump-owned cohort noun ("stagiaire" / "participant").
  const noun = $derived(cohortNounForms(cohortNoun));

  const STATUS_ICON: Record<ClosingListStatus, typeof Check> = {
    todo: Circle,
    in_progress: Clock,
    done: Check,
  };
  // The same reading as the inscrits' statut: nothing begun is neutral, work
  // under way is a warning, a closing done is settled.
  const STATUS_TONE: Record<ClosingListStatus, StatusTone> = {
    todo: 'neutral',
    in_progress: 'warning',
    done: 'success',
  };
  // Filters, sort and search live in the address (`$lib/domain/closingsView`),
  // so the event home's cards can open this list already filtered.
  const view = $derived(parseClosingsView(page.url.searchParams));
  const search = createUrlSearch();

  const facets = $derived(closingsFacets(rows, view));
  const facetOf = $derived(
    new Map<ClosingsFacet, ClosingsFacetState>(facets.map((f) => [f.facet, f])),
  );

  function setFacet(facet: ClosingsFacet, values: string[]) {
    setListParams(closingsFacetParams(facet, values));
  }

  // The header filter of a facet, or none when it has a single value to offer.
  function filterOf(facet: ClosingsFacet): ColumnDef['filter'] {
    const f = facetOf.get(facet);
    return f && f.options.length > 0
      ? {
          options: f.options,
          selected: f.selected,
          onChange: (values) => setFacet(facet, values),
        }
      : undefined;
  }

  // The mockup's columns, and like the Inscrits page one control each: the
  // names and the date sort, who conducted it, its state and the team's
  // verdict filter from their header.
  const columns = $derived.by<ColumnDef[]>(() => {
    const sortable = (key: ClosingsSortKey) => ({
      key,
      sortable: true,
      defaultSortDir: CLOSINGS_SORT_DEFAULT_DIR[key],
    });
    const filtered = (facet: ClosingsFacet, label: string, width: string) => ({
      key: facet,
      label,
      class: width,
      filter: filterOf(facet),
    });
    return [
      { key: 'avatar', label: '', class: 'w-12' },
      { ...sortable('prenom'), label: 'Prénom', class: 'w-28' },
      { ...sortable('nom'), label: 'Nom', class: 'w-36' },
      filtered('mene', 'Mené par', 'w-full'),
      { ...sortable('date'), label: 'Date', class: 'w-28' },
      filtered('statut', 'Statut', 'w-32'),
      filtered('avis', 'Avis', 'w-44'),
    ];
  });

  function toggleSort(key: string) {
    const next = nextSort<ClosingsSortKey>(
      columns,
      { key: view.sort, dir: view.dir },
      key,
    );
    setListParams(closingsSortParams(next.key, next.dir));
  }

  const chips = $derived<ActiveFilterChip[]>(
    facets.flatMap((f) =>
      f.selected.map((value) => ({
        id: `${f.facet}:${value}`,
        facet: f.title,
        label: f.options.find((o) => o.value === value)?.label ?? value,
        onRemove: () =>
          setFacet(
            f.facet,
            f.selected.filter((v) => v !== value),
          ),
      })),
    ),
  );

  // Clears the filters and the search, keeps the sort, as on Inscrits.
  function resetFilters() {
    search.clear();
    setListParams({ ...closingsClearedFacetParams(), q: '' });
  }

  const dateFmt = (d: Date | string | null) =>
    d
      ? new Date(d).toLocaleDateString('fr-FR', {
          day: 'numeric',
          month: 'short',
          timeZone: timezone,
        })
      : null;

  // A closing not yet conducted has no leader and no date. Those rows sink in
  // either direction (`rowComparator`), so a reversed sort surfaces the ones
  // that HAVE been conducted rather than leading with the empty half of the
  // roster. It used to lead with them: the null cases lived inside the asc/desc
  // flip, which inverted the intent along with the order.
  function sortsLast(r: ClosingRow, key: ClosingsSortKey): boolean {
    return key === 'date' && !r.conductedAt;
  }

  function compareRows(
    a: ClosingRow,
    b: ClosingRow,
    key: ClosingsSortKey,
  ): number {
    switch (key) {
      case 'prenom':
        return a.prenom.localeCompare(b.prenom, 'fr');
      case 'nom':
        return a.nom.localeCompare(b.nom, 'fr');
      case 'date':
        return (
          new Date(a.conductedAt ?? 0).getTime() -
          new Date(b.conductedAt ?? 0).getTime()
        );
    }
  }

  const filtered = $derived.by(() => {
    const tokens = searchTokens(search.value);
    const out = rows.filter((r) => {
      if (!matchesClosingsFacets(r, facets)) return false;
      return matchesAllTokens(
        buildHaystack([r.prenom, r.nom, r.staffName]),
        tokens,
      );
    });
    out.sort(
      rowComparator({
        compare: (a, b) => compareRows(a, b, view.sort),
        dir: view.dir,
        isMissing: (r) => sortsLast(r, view.sort),
      }),
    );
    return out;
  });

  const anyFiltersApplied = $derived(
    chips.length > 0 || search.value.trim().length > 0,
  );
  // A closing is an event-scoped act, so it is conducted on its own page under
  // the event rather than on the talent fiche: this roster is the way in
  // to conducting one, so the dev lands on the questions rather than on the
  // dossier with a toggle left to find.
  const conductHref = (r: ClosingRow) =>
    resolve(`/staff/dev/events/${eventId}/closings/${r.talentId}`);
</script>

{#snippet statusBadge(status: ClosingListStatus, full: boolean)}
  {@const Icon = STATUS_ICON[status]}
  <span class={cn(statusBadgeClass(STATUS_TONE[status]), full && 'shrink-0')}>
    <Icon class="h-3 w-3" />
    {CLOSING_STATUS_LABELS[status]}
  </span>
{/snippet}

{#snippet staffAvatar(name: string, image: string | null)}
  <Avatar.Root class="h-6 w-6 shrink-0">
    <Avatar.Image src={image ?? undefined} alt={name} class="object-cover" />
    <Avatar.Fallback class="bg-epi-blue/10 text-xs font-bold text-epi-blue">
      {getInitials(name)}
    </Avatar.Fallback>
  </Avatar.Root>
{/snippet}

{#if total === 0}
  <EmptyCohortNotice {cohortNoun} />
{:else}
  <ResultsLayout
    railClass="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1"
  >
    {#snippet main()}
      <DataTableToolbar
        searchValue={search.value}
        onSearchInput={(v) => (search.value = v)}
        searchPlaceholder={`Rechercher un ${noun.singular}…`}
        searchWidthClass="w-full max-w-[230px]"
        count={filtered.length}
        countNoun="closing"
        filtersApplied={anyFiltersApplied}
      />

      <ActiveFilterChips {chips} onReset={resetFilters} />

      <SortableTable
        onResetFilters={anyFiltersApplied ? resetFilters : undefined}
        noMatchHint={noMatchLine(page.url.pathname)}
        {columns}
        rows={filtered}
        sortKey={view.sort}
        sortDir={view.dir}
        onSort={toggleSort}
        rowKey={(r) => r.talentId}
        rowHref={conductHref}
        rowLabel={(r) => `Mener le closing de ${r.prenom} ${r.nom}`}
        stickyHeader
        layout="fixed"
        cardsBelow="xl"
      >
        {#snippet row(r: ClosingRow)}
          <Table.Cell>
            <TalentAvatar
              talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
              size="sm"
            />
          </Table.Cell>
          <Table.Cell class="font-medium">
            {@const prenom = formatGivenName(r.prenom)}
            <span class="block truncate" title={prenom}>{prenom}</span>
          </Table.Cell>
          <Table.Cell class="font-bold uppercase">
            <span class="block truncate" title={r.nom}>{r.nom}</span>
          </Table.Cell>
          <Table.Cell class="text-sm">
            {#if r.staffName}
              <span class="flex min-w-0 items-center gap-2">
                {@render staffAvatar(r.staffName, r.staffImage)}
                <span class="truncate" title={r.staffName}>
                  {r.staffName}
                </span>
              </span>
            {:else}
              <!-- « Ancien membre de l'équipe » is wider than the column: it
                   truncates like a name does, rather than running under the
                   date beside it. -->
              <span
                class="block truncate text-muted-foreground"
                title={conductorLabel(r) ?? undefined}
                >{conductorLabel(r) ?? '-'}</span
              >
            {/if}
          </Table.Cell>
          <Table.Cell class="text-sm text-muted-foreground">
            {dateFmt(r.conductedAt) ?? '-'}
          </Table.Cell>
          <Table.Cell>
            {@render statusBadge(r.status, false)}
          </Table.Cell>
          <Table.Cell>
            {@const verdict = closingVerdict(r)}
            {#if verdict}
              <ClosingVerdictChip recommendation={verdict} short />
            {:else}
              <span class="text-muted-foreground">-</span>
            {/if}
          </Table.Cell>
        {/snippet}

        {#snippet mobileRow(r: ClosingRow)}
          {@const prenom = formatGivenName(r.prenom)}
          {@const verdict = closingVerdict(r)}
          <div class="flex items-start gap-3">
            <TalentAvatar
              talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
              size="sm"
            />
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex items-start justify-between gap-2">
                <p class="min-w-0 truncate text-sm">
                  <span class="font-medium">{prenom}</span>
                  <span class="font-bold uppercase">{r.nom}</span>
                </p>
                {@render statusBadge(r.status, true)}
              </div>
              <div
                class="flex items-center gap-2 text-xs text-muted-foreground"
              >
                {#if r.staffName}
                  {@render staffAvatar(r.staffName, r.staffImage)}
                {/if}
                <span class="min-w-0 flex-1 truncate">
                  {conductorLabel(r) ?? NOT_CONDUCTED_LABEL}
                </span>
                {#if r.conductedAt}
                  <span class="shrink-0">{dateFmt(r.conductedAt)}</span>
                {/if}
              </div>
              {#if verdict}
                <ClosingVerdictChip recommendation={verdict} short />
              {/if}
            </div>
          </div>
        {/snippet}
      </SortableTable>
    {/snippet}

    <!-- Synthesis, the staff tally and the closing guide. -->
    {#snippet rail()}
      <SynthesisCard {counts} {total} {recoCounts} />
      <StaffTallyCard staff={topStaff} {currentStaffId} />
      <GuideCard />
    {/snippet}
  </ResultsLayout>
{/if}
