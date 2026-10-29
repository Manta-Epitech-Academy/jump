<script lang="ts">
  import { adminTalentHref } from '$lib/components/admin/adminTalentHref';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Funnel from '@lucide/svelte/icons/funnel';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import Pagination from '$lib/components/staff/datatable/Pagination.svelte';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import type {
    ActiveFilterChip,
    ColumnDef,
  } from '$lib/components/staff/datatable/types';
  import SearchableSelect from '$lib/components/staff/SearchableSelect.svelte';
  import ActiveFilterChips from '$lib/components/staff/ActiveFilterChips.svelte';
  import { facetControls } from '$lib/components/staff/datatable/facetControls';
  import { offerFacets } from '$lib/domain/listFacets';
  import { page } from '$app/state';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import StudentAvatarItem from '$lib/components/students/StudentAvatarItem.svelte';
  import { civiliteCourtesyTitle } from '$lib/domain/profile';
  import type { NotesCohort } from '../query';
  import {
    NOTES_SORT_DEFAULT_DIR,
    NOTES_VIEW,
    parseNoteFilters,
    type NotesSortKey,
  } from '../view';
  import { nextSort } from '$lib/components/staff/datatable/sort';
  import {
    clearListFilters,
    goToListPage,
    setListParams,
  } from '$lib/components/staff/datatable/urlList';
  import { createUrlSearch } from '$lib/components/staff/datatable/urlSearch.svelte';

  let { notes, facetCounts, campuses, totalItems, totalPages }: NotesCohort =
    $props();

  // The view lives in the address (`../view`); read here, the sort, the page,
  // the campus and the ticked authors answer the click before the server does.
  // The author counts come with the cohort, over every note, and go through
  // the rules the server applied to them (`offerFacets`).
  const view = $derived(parseNoteFilters(page.url.searchParams));
  const facets = $derived(offerFacets(facetCounts, view.facets));
  const controls = $derived(
    facetControls(facets, (facet, values) =>
      setListParams(NOTES_VIEW.facetParams(facet, values)),
    ),
  );

  // Admin moderation delete via the shared ConfirmDeleteDialog; its `update()`
  // re-streams the list afterwards, so no optimistic overlay is needed.
  let deleteOpen = $state(false);
  let noteToDelete = $state('');

  function requestDelete(id: string) {
    noteToDelete = id;
    deleteOpen = true;
  }

  const search = createUrlSearch();

  const campusName = $derived(new Map(campuses.map((c) => [c.id, c.name])));
  const campusOptions = $derived(
    campuses.map((c) => ({ value: c.id, label: c.name })),
  );
  const setCampuses = (ids: string[]) =>
    setListParams(NOTES_VIEW.facetParams('campus', ids));

  // The author's chips, then the campus's: it has no column, so its select and
  // its chips are the page's own.
  const chips = $derived<ActiveFilterChip[]>([
    ...controls.chips,
    ...view.facets.campus
      .filter((id) => campusName.has(id))
      .map((id) => ({
        id: `campus:${id}`,
        facet: 'Campus',
        label: campusName.get(id) ?? id,
        onRemove: () => setCampuses(view.facets.campus.filter((c) => c !== id)),
      })),
  ]);

  const hasFilters = $derived(
    chips.length > 0 || search.value.trim().length > 0,
  );

  // Clears the filters and the search, keeps the sort.
  function resetFilters() {
    clearListFilters(NOTES_VIEW.clearedFacetParams(), search);
  }

  // One control per column: the talent and the date sort, the author filters.
  const columns = $derived.by<ColumnDef[]>(() => {
    const sortable = (key: NotesSortKey) => ({
      key,
      sortable: true,
      defaultSortDir: NOTES_SORT_DEFAULT_DIR[key],
    });
    return [
      { ...sortable('talent'), label: 'Talent' },
      { key: 'note', label: 'Note' },
      { key: 'auteur', label: 'Auteur', filter: controls.filterOf('auteur') },
      { ...sortable('date'), label: 'Date' },
      { key: 'action', label: '', align: 'right', class: 'w-12' },
    ];
  });

  // One formatter per campus timezone (the gallery is global, so rows span
  // campuses), built lazily and cached: each note's date reads in its own campus
  // wall clock instead of the server's (these rows stream in SSR'd under a UTC
  // process) or the admin's browser.
  const fmtByTz = new Map<string, Intl.DateTimeFormat>();
  function fmtFor(tz: string): Intl.DateTimeFormat {
    let f = fmtByTz.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz,
      });
      fmtByTz.set(tz, f);
    }
    return f;
  }
  const when = (iso: string, tz: string) => fmtFor(tz).format(new Date(iso));

  function toggleSort(key: string) {
    const next = nextSort<NotesSortKey>(
      columns,
      { key: view.sort, dir: view.dir },
      key,
    );
    setListParams(NOTES_VIEW.sortParams(next.key, next.dir));
  }
</script>

<div class="space-y-4">
  <DataTableToolbar
    searchValue={search.value}
    onSearchInput={(v) => (search.value = v)}
    searchPlaceholder="Rechercher une note ou un talent…"
    count={totalItems}
    countNoun="note"
    filtersApplied={hasFilters}
  >
    {#snippet filters()}
      <SearchableSelect
        multiple
        options={campusOptions}
        values={view.facets.campus}
        onChangeMultiple={setCampuses}
        allLabel="Tous les campus"
        placeholder="Tous les campus"
        searchPlaceholder="Rechercher un campus…"
        emptyLabel="Aucun campus."
        triggerClass="w-full sm:w-48"
      >
        {#snippet icon()}
          <Funnel class="h-4 w-4 text-muted-foreground" />
        {/snippet}
      </SearchableSelect>
    {/snippet}
  </DataTableToolbar>

  <ActiveFilterChips {chips} {search} onReset={resetFilters} />

  <SortableTable
    {columns}
    rows={notes}
    sortKey={view.sort}
    sortDir={view.dir}
    onSort={toggleSort}
    rowKey={(n) => n.id}
  >
    {#snippet row(note)}
      <Table.Cell>
        <a
          href={adminTalentHref(note.talent)}
          class="inline-flex max-w-full transition-opacity hover:opacity-80"
          title="Voir le talent dans l'annuaire"
        >
          <StudentAvatarItem
            student={note.talent}
            subText={note.campus}
            courtesyTitle={civiliteCourtesyTitle(note.talent.civilite)}
          />
        </a>
      </Table.Cell>
      <Table.Cell class="py-2">
        <p class="text-sm whitespace-pre-wrap">{note.body}</p>
        {#if note.eventTitre}
          <p
            class="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"
          >
            <CalendarDays class="h-3 w-3 shrink-0" />
            <span class="truncate">{note.eventTitre}</span>
          </p>
        {/if}
      </Table.Cell>
      <Table.Cell class="text-sm whitespace-nowrap text-muted-foreground">
        {#if note.author}
          {note.author.name ?? 'Staff'}
        {:else}
          <span class="italic">Auteur inconnu</span>
        {/if}
      </Table.Cell>
      <Table.Cell class="text-sm whitespace-nowrap text-muted-foreground">
        {when(note.createdAt, note.timezone)}
        {#if note.edited}
          <span class="block text-xs">
            modifié{note.editedByName ? ` par ${note.editedByName}` : ''} le {when(
              note.updatedAt,
              note.timezone,
            )}
          </span>
        {/if}
      </Table.Cell>
      <Table.Cell class="text-right">
        <Button
          size="icon"
          variant="ghost"
          class="h-7 w-7 rounded-sm text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-destructive"
          onclick={() => requestDelete(note.id)}
          aria-label="Supprimer la note"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      </Table.Cell>
    {/snippet}

    {#snippet mobileRow(note)}
      <div class="space-y-1.5">
        <div class="flex items-start justify-between gap-2">
          <a
            href={adminTalentHref(note.talent)}
            class="min-w-0 transition-opacity hover:opacity-80"
            title="Voir le talent dans l'annuaire"
          >
            <StudentAvatarItem
              student={note.talent}
              subText={note.campus}
              courtesyTitle={civiliteCourtesyTitle(note.talent.civilite)}
              size="sm"
            />
          </a>
          <Button
            size="icon"
            variant="ghost"
            class="h-7 w-7 shrink-0 rounded-sm text-muted-foreground hover:text-destructive"
            onclick={() => requestDelete(note.id)}
            aria-label="Supprimer la note"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </Button>
        </div>
        <p class="text-sm whitespace-pre-wrap">{note.body}</p>
        {#if note.eventTitre}
          <p class="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays class="h-3 w-3 shrink-0" />
            <span class="truncate">{note.eventTitre}</span>
          </p>
        {/if}
        <p class="text-xs text-muted-foreground">
          {#if note.author}{note.author.name ?? 'Staff'}{:else}<span
              class="italic">Auteur inconnu</span
            >{/if} · {when(note.createdAt, note.timezone)}
        </p>
      </div>
    {/snippet}

    {#snippet empty()}
      <span class="text-sm text-muted-foreground">
        {hasFilters
          ? 'Aucune note ne correspond aux filtres.'
          : 'Aucune note pour le moment.'}
      </span>
    {/snippet}
  </SortableTable>

  <Pagination page={view.page} {totalPages} onPageChange={goToListPage} />
</div>

<ConfirmDeleteDialog
  bind:open={deleteOpen}
  action={`?/delete&id=${noteToDelete}`}
  title="Supprimer la note ?"
  description="Cette note sera définitivement supprimée. Cette action est irréversible."
/>
