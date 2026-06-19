<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Funnel from '@lucide/svelte/icons/funnel';
  import { Button } from '$lib/components/ui/button';
  import * as Table from '$lib/components/ui/table';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import Pagination from '$lib/components/staff/datatable/Pagination.svelte';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import type { ColumnDef } from '$lib/components/staff/datatable/types';
  import SearchableSelect from '$lib/components/staff/SearchableSelect.svelte';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import StudentAvatarItem from '$lib/components/students/StudentAvatarItem.svelte';
  import { civiliteCourtesyTitle } from '$lib/domain/profile';
  import type { NotesCohort, NoteFilters, NoteDirectoryRow } from '../query';

  // Renamed from `filters` to avoid shadowing the `{#snippet filters()}` passed
  // to DataTableToolbar.
  let {
    notes,
    campuses,
    authors,
    totalItems,
    totalPages,
    filters: filterState,
  }: NotesCohort & { filters: NoteFilters } = $props();

  // Admin moderation delete via the shared ConfirmDeleteDialog; its `update()`
  // re-streams the list afterwards, so no optimistic overlay is needed.
  let deleteOpen = $state(false);
  let noteToDelete = $state('');

  function requestDelete(id: string) {
    noteToDelete = id;
    deleteOpen = true;
  }

  // Seeded once from the loaded filter; the input owns it after mount (server
  // navigation re-mounts with fresh props), so capturing the initial value is
  // intentional.
  // svelte-ignore state_referenced_locally
  let searchQuery = $state(filterState.q);
  let searchTimeout: ReturnType<typeof setTimeout>;

  const hasFilters = $derived(
    !!(filterState.q || filterState.campusIds.length || filterState.author),
  );

  const campusOptions = $derived(
    campuses.map((c) => ({ value: c.id, label: c.name })),
  );
  const authorOptions = $derived(
    authors.map((a) => ({ value: a.id, label: a.name })),
  );

  const columns: ColumnDef[] = [
    { key: 'talent', label: 'Talent', sortable: true },
    { key: 'note', label: 'Note' },
    { key: 'auteur', label: 'Auteur' },
    { key: 'date', label: 'Date', sortable: true },
    { key: 'action', label: '', align: 'right', class: 'w-12' },
  ];

  const fmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const when = (iso: string) => fmt.format(new Date(iso));

  function navigateWithParams(params: Record<string, string>) {
    const url = new URL(page.url);
    url.searchParams.delete('page'); // any filter change resets to page 1
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    goto(url.toString(), { keepFocus: true });
  }

  function goToPage(p: number) {
    const url = new URL(page.url);
    if (p > 1) url.searchParams.set('page', String(p));
    else url.searchParams.delete('page');
    goto(url.toString());
  }

  function onSearchInput(value: string) {
    searchQuery = value;
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => navigateWithParams({ q: value }), 300);
  }

  function toggleSort(key: string) {
    const nextDir =
      filterState.sort === key && filterState.dir === 'asc' ? 'desc' : 'asc';
    navigateWithParams({ sort: key, dir: nextDir });
  }

  function talentsLink(t: NoteDirectoryRow['talent']) {
    const q = t.email ?? `${t.prenom} ${t.nom}`.trim();
    return `${resolve('/staff/admin/talents')}?q=${encodeURIComponent(q)}`;
  }
</script>

<div class="space-y-4">
  <DataTableToolbar
    searchValue={searchQuery}
    {onSearchInput}
    searchPlaceholder="Rechercher une note ou un talent…"
    count={totalItems}
    countNoun="note"
    countSuffix={hasFilters ? 'correspondent aux filtres' : undefined}
  >
    {#snippet filters()}
      <SearchableSelect
        multiple
        options={campusOptions}
        values={filterState.campusIds}
        onChangeMultiple={(ids) =>
          navigateWithParams({ campus: ids.join(',') })}
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
      <SearchableSelect
        options={authorOptions}
        value={filterState.author || 'all'}
        onChange={(v) => navigateWithParams({ author: v === 'all' ? '' : v })}
        allLabel="Tous les auteurs"
        placeholder="Tous les auteurs"
        searchPlaceholder="Rechercher un auteur…"
        emptyLabel="Aucun auteur."
        triggerClass="w-full sm:w-48"
      />
    {/snippet}
  </DataTableToolbar>

  <SortableTable
    {columns}
    rows={notes}
    sortKey={filterState.sort}
    sortDir={filterState.dir}
    onSort={toggleSort}
    rowKey={(n) => n.id}
  >
    {#snippet row(note)}
      <Table.Cell>
        <a
          href={talentsLink(note.talent)}
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
        {note.author?.name ?? 'Staff'}
      </Table.Cell>
      <Table.Cell class="text-sm whitespace-nowrap text-muted-foreground">
        {when(note.createdAt)}
        {#if note.edited}
          <span class="block text-xs">
            modifié{note.editedByName ? ` par ${note.editedByName}` : ''} le {when(
              note.updatedAt,
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
            href={talentsLink(note.talent)}
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
          {note.author?.name ?? 'Staff'} · {when(note.createdAt)}
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

  <Pagination page={filterState.page} {totalPages} onPageChange={goToPage} />
</div>

<ConfirmDeleteDialog
  bind:open={deleteOpen}
  action={`?/delete&id=${noteToDelete}`}
  title="Supprimer la note ?"
  description="Cette note sera définitivement supprimée. Cette action est irréversible."
/>
