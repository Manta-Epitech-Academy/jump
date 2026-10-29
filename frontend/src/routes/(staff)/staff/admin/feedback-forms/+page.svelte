<script lang="ts">
  import {
    buildHaystack,
    matchesAllTokens,
    searchTokens,
  } from '$lib/components/staff/datatable/search';
  import { untrack, onMount } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { enhance as formEnhance } from '$app/forms';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import Plus from '@lucide/svelte/icons/plus';
  import Copy from '@lucide/svelte/icons/copy';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Pencil from '@lucide/svelte/icons/pencil';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import FormStatusSelect from '$lib/components/admin/feedback/FormStatusSelect.svelte';
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
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import { FORM_STATUS_LABELS } from '$lib/domain/feedbackForms/status';
  import { publicFormPath } from '$lib/domain/feedback';
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';
  import type { FormListRow, FormsCohort } from './+page.server';
  import { nextSort } from '$lib/components/staff/datatable/sort';

  let { data }: { data: PageData } = $props();

  let createOpen = $state(false);
  let deleteOpen = $state(false);
  let deleteTarget = $state<FormListRow | null>(null);

  // Deep-link from the event config wizard's "Créer un nouveau formulaire":
  // land here with the create dialog already open instead of on a bare table.
  // One-shot (onMount, not $effect) so closing the dialog doesn't reopen it.
  onMount(() => {
    if (page.url.searchParams.has('create')) createOpen = true;
  });

  // This page writes optimistically - a status change mutates the row in place,
  // and the delete dialog's `update()` rebuilds `data.cohort` - so the list is
  // held across those rather than re-awaited. See `createStreamedCohort`.
  const cohort = createStreamedCohort<FormsCohort>(() => data.cohort);

  const { form, errors, enhance } = superForm(
    untrack(() => data.createFormForm),
    {
      onResult: ({ result }) => {
        if (result.type === 'redirect') createOpen = false;
      },
    },
  );

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

  /** Id of the row whose status PATCH is in flight (locks its trigger). */
  let statusPending = $state<string | null>(null);

  // Changes a form's status straight from the list, reusing the builder's meta
  // endpoint so status mutation has a single source of truth. Archiving is the
  // supported way to retire a form that already has responses (it can't be
  // deleted), so the control lives right where that need surfaces.
  async function setStatus(row: FormListRow, status: string) {
    if (status === row.status) return;
    statusPending = row.id;
    try {
      const res = await fetch(
        resolve(`/staff/admin/feedback-forms/${row.id}/meta`),
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        toast.error(body?.message ?? 'Le changement de statut a échoué.');
        return;
      }
      row.status = status;
      // Publishing a form no audience can reach is allowed but pointless; mirror
      // the builder's reachability warning instead of letting it fail silently.
      if (
        status === 'published' &&
        !row.allowsAuthenticatedAccess &&
        !row.allowsPublicAccess
      ) {
        toast.warning(
          'Publié, mais aucun mode d’accès n’est activé : personne ne peut répondre. Ouvrez les paramètres pour en activer un.',
        );
      } else {
        toast.success(
          `Statut : ${FORM_STATUS_LABELS[status as keyof typeof FORM_STATUS_LABELS]}`,
        );
      }
    } finally {
      statusPending = null;
    }
  }

  function askDelete(row: FormListRow) {
    deleteTarget = row;
    deleteOpen = true;
  }
</script>

<svelte:head><title>Formulaires de feedback</title></svelte:head>

<div class="space-y-6">
  <PageHeader title="Formulaires" accent="de feedback">
    {#snippet actions()}
      <Button size="sm" class="rounded-sm" onclick={() => (createOpen = true)}>
        <Plus class="mr-1.5 h-4 w-4" /> Nouveau formulaire
      </Button>
    {/snippet}
  </PageHeader>

  {#if cohort.failed}
    <ResultsNotice
      title="Chargement impossible"
      description="La liste des formulaires n'a pas pu être chargée. Rechargez la page pour réessayer."
    />
  {:else if cohort.value === null}
    <p class="text-sm text-muted-foreground">Chargement…</p>
  {:else if cohort.value.rows.length === 0}
    <ResultsNotice description="Aucun formulaire pour le moment." />
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
            <FormStatusSelect
              value={r.status}
              onChange={(v) => setStatus(r, v)}
              disabled={statusPending === r.id}
            />
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
                      <Pencil class="h-4 w-4" />
                      <span class="sr-only">Modifier</span>
                    </Button>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content>Modifier</Tooltip.Content>
              </Tooltip.Root>
              <form
                method="POST"
                action="?/duplicate"
                use:formEnhance={() =>
                  async ({ result, update }) => {
                    // The action redirects to the new form; toast first so the
                    // duplication is acknowledged and persists across the nav.
                    if (result.type === 'redirect') {
                      toast.success('Formulaire dupliqué');
                    }
                    await update();
                  }}
              >
                <input type="hidden" name="id" value={r.id} />
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      <Button
                        {...props}
                        type="submit"
                        variant="ghost"
                        size="icon"
                        class="h-8 w-8"
                      >
                        <Copy class="h-4 w-4" />
                        <span class="sr-only">Dupliquer</span>
                      </Button>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content>Dupliquer</Tooltip.Content>
                </Tooltip.Root>
              </form>
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
                    ? 'Ce formulaire a des réponses : passez son statut à « Archivé » pour le retirer.'
                    : 'Supprimer'}
                </Tooltip.Content>
              </Tooltip.Root>
            </div>
          </Table.Cell>
        {/snippet}

        {#snippet empty()}
          <div class="flex flex-col items-center gap-3 py-6">
            <span
              class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
            >
              Aucun formulaire ne correspond
            </span>
          </div>
        {/snippet}
      </SortableTable>
    </Tooltip.Provider>
  {/if}
</div>

<Dialog.Root bind:open={createOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Nouveau formulaire</Dialog.Title>
      <Dialog.Description>
        Un brouillon vide est créé ; ajoutez ensuite les sections et questions.
      </Dialog.Description>
    </Dialog.Header>
    <form method="POST" action="?/create" use:enhance class="space-y-4">
      <div class="space-y-1.5">
        <Label for="title">Titre</Label>
        <Input id="title" name="title" bind:value={$form.title} />
        {#if $errors.title}
          <p class="text-xs text-destructive">{$errors.title}</p>
        {/if}
      </div>
      <div class="space-y-1.5">
        <Label for="intro">Message d'introduction (facultatif)</Label>
        <Textarea
          id="intro"
          name="intro"
          rows={4}
          placeholder="Laissé vide, la mascotte dit un message d’accueil par défaut."
          bind:value={$form.intro}
        />
        {#if $errors.intro}
          <p class="text-xs text-destructive">{$errors.intro}</p>
        {/if}
      </div>
      <Dialog.Footer>
        <Button type="submit">Créer</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

{#if deleteTarget}
  <ConfirmDeleteDialog
    bind:open={deleteOpen}
    action={`?/delete&id=${deleteTarget.id}`}
    title="Supprimer ce formulaire ?"
    description={`« ${deleteTarget.title} » sera définitivement supprimé.`}
  />
{/if}
