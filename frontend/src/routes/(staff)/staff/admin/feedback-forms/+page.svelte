<script lang="ts">
  import {
    buildHaystack,
    matchesAllTokens,
    searchTokens,
  } from '$lib/components/staff/datatable/search';
  import { page } from '$app/state';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Eye from '@lucide/svelte/icons/eye';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import { createStreamedCohort } from '$lib/components/staff/streamedCohort.svelte';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import type { ColumnDef } from '$lib/components/staff/datatable/types';
  import ActiveFilterChips from '$lib/components/staff/ActiveFilterChips.svelte';
  import { facetControls } from '$lib/components/staff/datatable/facetControls';
  import {
    clearListFilters,
    setListParams,
  } from '$lib/components/staff/datatable/urlList';
  import { createUrlSearch } from '$lib/components/staff/datatable/urlSearch.svelte';
  import { listFacets, matchesListFacets } from '$lib/domain/listFacets';
  import {
    FORMS_FACET_DEFS,
    FORMS_SORT_DEFAULT_DIR,
    FORMS_VIEW,
    type FormsSortKey,
  } from './view';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import {
    FORM_STATUS_BADGE_CLASS,
    FORM_STATUS_LABELS,
    type FormStatusValue,
  } from '$lib/domain/feedbackForms/status';
  import { publicFormPath } from '$lib/domain/feedback';
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';
  import type { FormListRow, FormsCohort } from './+page.server';
  import { nextSort } from '$lib/components/staff/datatable/sort';

  let { data }: { data: PageData } = $props();

  let deleteOpen = $state(false);
  let deleteTarget = $state<FormListRow | null>(null);

  // The delete dialog's `update()` rebuilds `data.cohort`, so the list is held
  // across it rather than re-awaited. See `createStreamedCohort`.
  const cohort = createStreamedCohort<FormsCohort>(() => data.cohort);

  // ─── Filters + sort (in-memory over the resolved list) ────────────────────
  // The view lives in the address (`./view`), so a reload or a shared link
  // shows the same list.
  const view = $derived(FORMS_VIEW.parse(page.url.searchParams));
  const search = createUrlSearch();

  const facets = $derived(
    listFacets(
      cohort.value?.rows ?? [],
      FORMS_FACET_DEFS,
      FORMS_VIEW.facets,
      view.facets,
    ),
  );
  const controls = $derived(
    facetControls(facets, (facet, values) =>
      setListParams(FORMS_VIEW.facetParams(facet, values)),
    ),
  );

  // No fixed column widths: auto layout sizes to content so the status pill keeps
  // its full label (a `w-full` title forced the others to min-width and clipped
  // it). The title column naturally absorbs the slack as the longest content.
  const columns = $derived.by<ColumnDef[]>(() => {
    const sortable = (key: FormsSortKey) => ({
      key,
      sortable: true,
      defaultSortDir: FORMS_SORT_DEFAULT_DIR[key],
    });
    return [
      { ...sortable('title'), label: 'Titre' },
      { key: 'status', label: 'Statut', filter: controls.filterOf('statut') },
      { key: 'access', label: 'Accès' },
      { ...sortable('questions'), label: 'Questions', align: 'right' },
      { ...sortable('responses'), label: 'Réponses', align: 'right' },
      { ...sortable('updated'), label: 'Modifié' },
      { key: 'actions', label: '', align: 'right' },
    ];
  });

  function toggleSort(key: string) {
    const next = nextSort<FormsSortKey>(
      columns,
      { key: view.sort, dir: view.dir },
      key,
    );
    setListParams(FORMS_VIEW.sortParams(next.key, next.dir));
  }

  function compareRows(
    a: FormListRow,
    b: FormListRow,
    key: FormsSortKey,
  ): number {
    switch (key) {
      case 'title':
        return a.title.localeCompare(b.title, 'fr');
      case 'questions':
        return a.questionCount - b.questionCount;
      case 'responses':
        return a.submissionCount - b.submissionCount;
      case 'updated':
        // updatedAt is an ISO string → lexicographic compare is chronological.
        return a.updatedAt.localeCompare(b.updatedAt);
    }
  }

  const rows = $derived.by(() => {
    if (!cohort.value) return [];
    const tokens = searchTokens(search.value);
    const out = cohort.value.rows.filter((r) => {
      if (!matchesListFacets(r, facets, FORMS_FACET_DEFS)) return false;
      return matchesAllTokens(buildHaystack([r.title, r.slug]), tokens);
    });
    out.sort((a, b) => {
      const c = compareRows(a, b, view.sort);
      return view.dir === 'asc' ? c : -c;
    });
    return out;
  });

  const anyFiltersApplied = $derived(
    search.value.trim().length > 0 || controls.chips.length > 0,
  );
  // Clears the filters and the search, keeps the sort.
  function resetFilters() {
    clearListFilters(FORMS_VIEW.clearedFacetParams(), search);
  }

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const fmtDate = (iso: string) => dateFmt.format(new Date(iso));

  function askDelete(row: FormListRow) {
    deleteTarget = row;
    deleteOpen = true;
  }
</script>

<svelte:head><title>Formulaires de feedback</title></svelte:head>

<div class="space-y-6">
  <PageHeader
    title="Formulaires"
    accent="de feedback"
    subtitle="Chaque formulaire tel qu’on y répond, et ses réponses"
  />

  {#if cohort.failed}
    <ResultsNotice
      title="Chargement impossible"
      description="La liste des formulaires n'a pas pu être chargée. Rechargez la page pour réessayer."
    />
  {:else if cohort.value === null}
    <p class="text-sm text-muted-foreground">Chargement…</p>
  {:else if cohort.value.rows.length === 0}
    <ResultsNotice
      description="Aucun formulaire pour le moment. Un formulaire s’écrit par l’API admin (write_feedback_form), puis se retrouve ici avec ses réponses."
    />
  {:else}
    <DataTableToolbar
      searchValue={search.value}
      onSearchInput={(v) => (search.value = v)}
      searchPlaceholder="Rechercher un formulaire…"
      searchWidthClass="w-full max-w-[260px]"
      count={rows.length}
      countNoun="formulaire"
      filtersApplied={anyFiltersApplied}
    />

    <ActiveFilterChips chips={controls.chips} {search} onReset={resetFilters} />

    <Tooltip.Provider delayDuration={300}>
      <SortableTable
        onResetFilters={anyFiltersApplied ? resetFilters : undefined}
        {columns}
        {rows}
        sortKey={view.sort}
        sortDir={view.dir}
        onSort={toggleSort}
        rowKey={(r) => r.id}
      >
        {#snippet row(r: FormListRow)}
          <Table.Cell>
            <a
              href={resolve(`/staff/admin/feedback-forms/${r.id}`)}
              class="font-medium hover:underline"
            >
              {r.title}
            </a>
            {#if r.allowsPublicAccess}
              <!-- Public form: show the real shareable link. -->
              <span
                class="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground"
              >
                {publicFormPath(r.slug)}
                <CopyButton
                  value={`${page.url.origin}${publicFormPath(r.slug)}`}
                  label="Copier le lien public"
                />
              </span>
            {:else}
              <span class="block font-mono text-xs text-muted-foreground">
                {r.slug}
              </span>
            {/if}
          </Table.Cell>
          <Table.Cell>
            <span
              class="rounded-sm px-2 py-0.5 text-xs font-medium whitespace-nowrap {FORM_STATUS_BADGE_CLASS[
                r.status as FormStatusValue
              ]}"
            >
              {FORM_STATUS_LABELS[r.status as FormStatusValue]}
            </span>
          </Table.Cell>
          <Table.Cell>
            <Badge variant="outline" class="epi-chip">
              {r.allowsPublicAccess ? 'Auth + Public' : 'Auth'}
            </Badge>
          </Table.Cell>
          <Table.Cell class="text-right font-mono text-sm">
            {r.questionCount}
          </Table.Cell>
          <Table.Cell class="text-right font-mono text-sm">
            {r.submissionCount}
          </Table.Cell>
          <Table.Cell class="text-xs whitespace-nowrap text-muted-foreground">
            {fmtDate(r.updatedAt)}
          </Table.Cell>
          <Table.Cell>
            <div class="flex items-center justify-end gap-1">
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8"
                      href={resolve(
                        `/staff/admin/feedback-forms/${r.id}/responses`,
                      )}
                    >
                      <MessageSquare class="h-4 w-4" />
                      <span class="sr-only">Réponses</span>
                    </Button>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content>Réponses ({r.submissionCount})</Tooltip.Content
                >
              </Tooltip.Root>
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8"
                      href={resolve(`/staff/admin/feedback-forms/${r.id}`)}
                    >
                      <Eye class="h-4 w-4" />
                      <span class="sr-only">Aperçu</span>
                    </Button>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content>Aperçu</Tooltip.Content>
              </Tooltip.Root>
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <!-- Span wrapper so the tooltip still fires while the button
                         is disabled (a disabled button emits no pointer events);
                         this is the case where the hint matters most: why
                         deletion is blocked. -->
                    <span {...props} class="inline-flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={r.submissionCount > 0}
                        onclick={() => askDelete(r)}
                      >
                        <Trash2 class="h-4 w-4" />
                        <span class="sr-only">Supprimer</span>
                      </Button>
                    </span>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {r.submissionCount > 0
                    ? 'Ce formulaire a des réponses : archivez-le pour le retirer (write_feedback_form, status archived).'
                    : 'Supprimer'}
                </Tooltip.Content>
              </Tooltip.Root>
            </div>
          </Table.Cell>
        {/snippet}
      </SortableTable>
    </Tooltip.Provider>
  {/if}
</div>

{#if deleteTarget}
  <ConfirmDeleteDialog
    bind:open={deleteOpen}
    action={`?/delete&id=${deleteTarget.id}`}
    title="Supprimer ce formulaire ?"
    description={`« ${deleteTarget.title} » sera définitivement supprimé.`}
  />
{/if}
