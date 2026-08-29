<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import Circle from '@lucide/svelte/icons/circle';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import * as Table from '$lib/components/ui/table';
  import { cn } from '$lib/utils';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import ResultsLayout from '$lib/components/staff/ResultsLayout.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import type {
    ColumnDef,
    SortDir,
  } from '$lib/components/staff/datatable/types';
  import { type SegmentOption } from '$lib/components/staff/SegmentedFilter.svelte';
  import FilterSelect from '$lib/components/staff/FilterSelect.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import { resolve } from '$app/paths';
  import * as Avatar from '$lib/components/ui/avatar';
  import { getInitials } from '$lib/avatar';
  import { formatGivenName } from '$lib/domain/profile';
  import { cohortNounForms } from '$lib/domain/event';
  import {
    CLOSING_STATUS_LABELS,
    CLOSING_STATUS_CHIP_CLASS,
    type ClosingListStatus,
  } from '$lib/domain/closing';
  import type { ClosingRow, SortKey, ClosingsCohort } from './types';
  import SynthesisCard from './SynthesisCard.svelte';
  import StaffTallyCard from './StaffTallyCard.svelte';
  import GuideCard from '$lib/components/dev/closings/GuideCard.svelte';
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
  // Least-advanced first in ascending sort, so the talents still to call float up.
  const STATUS_ORDER: Record<ClosingListStatus, number> = {
    todo: 0,
    in_progress: 1,
    done: 2,
  };

  let searchQuery = $state('');
  let statutFilter = $state<'all' | ClosingListStatus>('all');
  let sortKey = $state<SortKey>('nom');
  let sortDir = $state<SortDir>('asc');

  const columns: ColumnDef[] = [
    { key: 'avatar', label: '', class: 'w-12' },
    { key: 'prenom', label: 'Prénom', sortable: true, class: 'w-28' },
    { key: 'nom', label: 'Nom', sortable: true, class: 'w-36' },
    {
      key: 'staff',
      label: 'Mené par',
      sortable: true,
      class: 'w-full',
    },
    { key: 'date', label: 'Date', sortable: true, class: 'w-28' },
    { key: 'status', label: 'Statut', sortable: true, class: 'w-28' },
  ];

  const statutOptions: SegmentOption[] = [
    { value: 'all', label: 'Tous' },
    { value: 'todo', label: CLOSING_STATUS_LABELS.todo },
    { value: 'in_progress', label: CLOSING_STATUS_LABELS.in_progress },
    { value: 'done', label: CLOSING_STATUS_LABELS.done },
  ];

  function toggleSort(key: string) {
    const next = nextSort(columns, { key: sortKey, dir: sortDir }, key);
    sortKey = next.key;
    sortDir = next.dir;
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
  function sortsLast(r: ClosingRow, key: SortKey): boolean {
    if (key === 'staff') return !r.staffName;
    if (key === 'date') return !r.conductedAt;
    return false;
  }

  function compareRows(a: ClosingRow, b: ClosingRow, key: SortKey): number {
    switch (key) {
      case 'prenom':
        return a.prenom.localeCompare(b.prenom, 'fr');
      case 'nom':
        return a.nom.localeCompare(b.nom, 'fr');
      case 'staff':
        return (a.staffName ?? '').localeCompare(b.staffName ?? '', 'fr');
      case 'date':
        return (
          new Date(a.conductedAt ?? 0).getTime() -
          new Date(b.conductedAt ?? 0).getTime()
        );
      case 'status':
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    }
  }

  const filtered = $derived.by(() => {
    const tokens = searchTokens(searchQuery);
    const out = rows.filter((r) => {
      if (statutFilter !== 'all' && r.status !== statutFilter) return false;
      return matchesAllTokens(
        buildHaystack([r.prenom, r.nom, r.staffName]),
        tokens,
      );
    });
    out.sort(
      rowComparator({
        compare: (a, b) => compareRows(a, b, sortKey),
        dir: sortDir,
        isMissing: (r) => sortsLast(r, sortKey),
      }),
    );
    return out;
  });

  const anyFiltersApplied = $derived(
    searchQuery.trim().length > 0 || statutFilter !== 'all',
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
  <span
    class={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 epi-chip',
      full && 'shrink-0',
      CLOSING_STATUS_CHIP_CLASS[status],
    )}
  >
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
  <ResultsNotice
    icon={MessageSquare}
    title={`Aucun ${noun.singular} inscrit`}
    description="Les closings apparaîtront ici dès que la cohorte de l'événement sera synchronisée."
  />
{:else}
  <ResultsLayout
    railClass="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1"
  >
    {#snippet main()}
      <DataTableToolbar
        searchValue={searchQuery}
        onSearchInput={(v) => (searchQuery = v)}
        searchPlaceholder={`Rechercher un ${noun.singular}…`}
        searchWidthClass="w-full max-w-[230px]"
        filtersAlign="end"
        count={filtered.length}
        countNoun="closing"
        filtersApplied={anyFiltersApplied}
      >
        {#snippet filters()}
          <div class="flex items-center gap-2">
            <span class="hidden epi-overline text-muted-foreground sm:inline">
              Statut
            </span>
            <FilterSelect
              ariaLabel="Filtrer par statut de closing"
              options={statutOptions}
              value={statutFilter}
              onChange={(v) => (statutFilter = v as typeof statutFilter)}
            />
          </div>
        {/snippet}
      </DataTableToolbar>

      <SortableTable
        {columns}
        rows={filtered}
        {sortKey}
        {sortDir}
        onSort={toggleSort}
        rowKey={(r) => r.talentId}
        rowHref={conductHref}
        rowLabel={(r) => `Mener le closing de ${r.prenom} ${r.nom}`}
        stickyHeader
        layout="fixed"
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
              <span class="text-muted-foreground">—</span>
            {/if}
          </Table.Cell>
          <Table.Cell class="text-sm text-muted-foreground">
            {dateFmt(r.conductedAt) ?? '—'}
          </Table.Cell>
          <Table.Cell>
            {@render statusBadge(r.status, false)}
          </Table.Cell>
        {/snippet}

        {#snippet mobileRow(r: ClosingRow)}
          {@const prenom = formatGivenName(r.prenom)}
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
                  {r.staffName ?? 'Pas encore mené'}
                </span>
                {#if r.conductedAt}
                  <span class="shrink-0">{dateFmt(r.conductedAt)}</span>
                {/if}
              </div>
            </div>
          </div>
        {/snippet}

        {#snippet empty()}
          <div class="flex flex-col items-center gap-3 py-6">
            <span
              class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
            >
              Aucun résultat
            </span>
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
