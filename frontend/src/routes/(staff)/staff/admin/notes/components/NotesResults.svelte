<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { toast } from 'svelte-sonner';
  import { SvelteSet } from 'svelte/reactivity';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Funnel from '@lucide/svelte/icons/funnel';
  import { Button } from '$lib/components/ui/button';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import Pagination from '$lib/components/staff/datatable/Pagination.svelte';
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';
  import SearchableSelect from '$lib/components/staff/SearchableSelect.svelte';
  import FilterSelect from '$lib/components/staff/FilterSelect.svelte';
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

  // Optimistic delete overlay: a removed note hides at once (server already
  // deleted it) without re-streaming the whole page. `notes` stays the source of
  // truth per navigation; this just hides ids the admin pulled this session.
  let deletedIds = new SvelteSet<string>();
  const visible = $derived(notes.filter((n) => !deletedIds.has(n.id)));

  let confirmingId = $state<string | null>(null);

  // Seeded once from the loaded filter; the input owns it after mount (server
  // navigation re-mounts with fresh props), so capturing the initial value is
  // intentional.
  // svelte-ignore state_referenced_locally
  let searchQuery = $state(filterState.q);
  let searchTimeout: ReturnType<typeof setTimeout>;

  const hasFilters = $derived(
    !!(filterState.q || filterState.campusIds.length || filterState.author),
  );

  const dirOptions = [
    { value: 'desc', label: 'Plus récentes' },
    { value: 'asc', label: 'Plus anciennes' },
  ];
  const campusOptions = $derived(
    campuses.map((c) => ({ value: c.id, label: c.name })),
  );
  const authorOptions = $derived([
    { value: '', label: 'Tous les auteurs' },
    ...authors.map((a) => ({ value: a.id, label: a.name })),
  ]);

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

  function talentsLink(t: NoteDirectoryRow['talent']) {
    const q = t.email ?? `${t.prenom ?? ''} ${t.nom ?? ''}`.trim();
    return `${resolve('/staff/admin/talents')}?q=${encodeURIComponent(q)}`;
  }

  function deleteSubmit(noteId: string): SubmitFunction {
    return () =>
      async ({ result }) => {
        confirmingId = null;
        if (result.type === 'success') {
          deletedIds.add(noteId);
          toast.success('Note supprimée.');
        } else if (result.type === 'failure') {
          toast.error(
            (result.data?.message as string) ?? 'Suppression impossible.',
          );
        } else {
          toast.error('Suppression impossible.');
        }
      };
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
      <SegmentedFilter
        ariaLabel="Trier les notes"
        options={dirOptions}
        value={filterState.dir}
        onChange={(v) => navigateWithParams({ dir: v })}
      />
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
      <FilterSelect
        ariaLabel="Filtrer par auteur"
        options={authorOptions}
        value={filterState.author}
        onChange={(v) => navigateWithParams({ author: v })}
        triggerClass="w-full sm:w-48"
      />
    {/snippet}
  </DataTableToolbar>

  {#if visible.length === 0}
    <p class="py-16 text-center text-sm text-muted-foreground">
      {hasFilters
        ? 'Aucune note ne correspond aux filtres.'
        : 'Aucune note pour le moment.'}
    </p>
  {:else}
    <div class="space-y-2">
      {#each visible as note (note.id)}
        <article class="rounded-sm border bg-card p-3">
          <div class="flex items-start justify-between gap-3">
            <a
              href={talentsLink(note.talent)}
              class="min-w-0 rounded-sm transition-opacity hover:opacity-80"
              title="Voir le talent dans l'annuaire"
            >
              <StudentAvatarItem
                student={note.talent}
                subText={note.campus}
                courtesyTitle={civiliteCourtesyTitle(note.talent.civilite)}
              />
            </a>
            <form
              method="POST"
              action="?/delete"
              use:enhance={deleteSubmit(note.id)}
              class="shrink-0"
            >
              <input type="hidden" name="noteId" value={note.id} />
              {#if confirmingId === note.id}
                <div class="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    class="h-7"
                    onclick={() => (confirmingId = null)}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    variant="destructive"
                    class="h-7"
                  >
                    Supprimer
                  </Button>
                </div>
              {:else}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  class="h-7 w-7 rounded-sm text-muted-foreground hover:text-destructive"
                  onclick={() => (confirmingId = note.id)}
                  aria-label="Supprimer la note"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </Button>
              {/if}
            </form>
          </div>

          <p class="mt-2 text-sm whitespace-pre-wrap">{note.body}</p>

          {#if note.eventTitre}
            <p
              class="mt-2 flex items-center gap-1 text-xs text-muted-foreground"
            >
              <CalendarDays class="h-3.5 w-3.5" />
              {note.eventTitre}
            </p>
          {/if}

          <p class="mt-2 text-xs text-muted-foreground">
            {note.author?.name ?? 'Staff'} · {when(note.createdAt)}
            {#if note.edited}
              · modifié{note.editedByName ? ` par ${note.editedByName}` : ''} le {when(
                note.updatedAt,
              )}
            {/if}
          </p>
        </article>
      {/each}
    </div>
  {/if}

  <Pagination page={filterState.page} {totalPages} onPageChange={goToPage} />
</div>
