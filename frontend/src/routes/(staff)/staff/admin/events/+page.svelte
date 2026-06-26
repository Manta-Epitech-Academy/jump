<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import CalendarCog from '@lucide/svelte/icons/calendar-cog';
  import Pencil from '@lucide/svelte/icons/pencil';
  import FilterX from '@lucide/svelte/icons/filter-x';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Badge } from '$lib/components/ui/badge';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import type {
    ColumnDef,
    SortDir,
  } from '$lib/components/staff/datatable/types';
  import SegmentedFilter, {
    type SegmentOption,
  } from '$lib/components/staff/SegmentedFilter.svelte';
  import FilterSelect from '$lib/components/staff/FilterSelect.svelte';
  import SearchableSelect from '$lib/components/staff/SearchableSelect.svelte';
  import { toast } from 'svelte-sonner';
  import {
    EVENT_MODULE_DEFS,
    EVENT_MODULE_KEYS,
    type EventModuleKey,
  } from '$lib/domain/eventModules';
  import type { AdminEventVM } from './+page.server';

  let { data } = $props();

  // ─── Filters + sort (in-memory over the full event list) ──────────────────
  let search = $state('');
  let campusFilter = $state('all');
  let yearFilter = $state('all');
  let typeFilter = $state('all');
  // Default mirrors the server order (date desc): the newest events first.
  let sortKey = $state('date');
  let sortDir = $state<SortDir>('desc');

  const campusOptions = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const e of data.events) seen.set(e.campusId, e.campusName);
    return [...seen]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  });

  const yearOptions = $derived.by<SegmentOption[]>(() => {
    const seen = new Map<string, number>();
    for (const e of data.events) seen.set(e.schoolYearLabel, e.schoolYearStart);
    const years = [...seen]
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => ({ value: label, label }));
    return [{ value: 'all', label: 'Toutes les années' }, ...years];
  });

  const typeOptions = $derived.by<SegmentOption[]>(() => {
    const seen = new Map<string, string>();
    for (const e of data.events) seen.set(e.eventType, e.eventTypeLabel);
    const types = [...seen]
      .sort((a, b) => a[1].localeCompare(b[1], 'fr'))
      .map(([value, label]) => ({ value, label }));
    return [{ value: 'all', label: 'Tous' }, ...types];
  });
  const showTypeFilter = $derived(typeOptions.length > 2);

  const columns: ColumnDef[] = [
    { key: 'name', label: 'Événement', sortable: true, class: 'w-full' },
    { key: 'campus', label: 'Campus', sortable: true, class: 'w-40' },
    { key: 'type', label: 'Type', class: 'w-32' },
    { key: 'date', label: 'Dates', sortable: true, class: 'w-44' },
    { key: 'modules', label: 'Modules', class: 'w-60' },
    {
      key: 'participations',
      label: 'Inscrits',
      sortable: true,
      align: 'right',
      defaultSortDir: 'desc',
      class: 'w-24',
    },
    { key: 'actions', label: '', align: 'right', class: 'w-16' },
  ];

  function toggleSort(key: string) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = columns.find((c) => c.key === key)?.defaultSortDir ?? 'asc';
    }
  }

  function compareEvents(
    a: AdminEventVM,
    b: AdminEventVM,
    key: string,
  ): number {
    switch (key) {
      case 'name':
        return a.displayName.localeCompare(b.displayName, 'fr');
      case 'campus':
        return a.campusName.localeCompare(b.campusName, 'fr');
      case 'date':
        return a.dateTs - b.dateTs;
      case 'participations':
        return a.participations - b.participations;
      default:
        return 0;
    }
  }

  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const out = data.events.filter((e) => {
      if (campusFilter !== 'all' && e.campusId !== campusFilter) return false;
      if (yearFilter !== 'all' && e.schoolYearLabel !== yearFilter)
        return false;
      if (typeFilter !== 'all' && e.eventType !== typeFilter) return false;
      if (!q) return true;
      return (
        e.displayName.toLowerCase().includes(q) ||
        e.titre.toLowerCase().includes(q) ||
        e.campusName.toLowerCase().includes(q) ||
        e.eventTypeLabel.toLowerCase().includes(q)
      );
    });
    out.sort((a, b) => {
      const c = compareEvents(a, b, sortKey);
      return sortDir === 'asc' ? c : -c;
    });
    return out;
  });

  const anyFiltersApplied = $derived(
    search.trim().length > 0 ||
      campusFilter !== 'all' ||
      yearFilter !== 'all' ||
      typeFilter !== 'all',
  );
  const countSuffix = $derived(
    anyFiltersApplied
      ? filtered.length > 1
        ? 'correspondent aux filtres'
        : 'correspond aux filtres'
      : 'au total',
  );

  function resetFilters() {
    search = '';
    campusFilter = 'all';
    yearFilter = 'all';
    typeFilter = 'all';
  }

  // ─── Edit dialog ─────────────────────────────────────────────────────────
  const { form, errors, enhance, delayed } = superForm(
    untrack(() => data.form),
    {
      onResult: ({ result }) => {
        if (result.type === 'success') {
          open = false;
          toast.success(result.data?.form?.message || 'Événement mis à jour.');
        }
      },
    },
  );

  let open = $state(false);
  let editing = $state<AdminEventVM | null>(null);

  function openEdit(e: AdminEventVM) {
    editing = e;
    $form.id = e.id;
    $form.publicName = e.publicName;
    $form.startTime = e.startTime;
    $form.endDate = e.endDate;
    $form.notes = e.notes;
    $form.modules = [...e.modules];
    open = true;
  }

  function toggleModule(key: EventModuleKey, checked: boolean) {
    if (checked) {
      if (!$form.modules.includes(key)) $form.modules = [...$form.modules, key];
    } else {
      $form.modules = $form.modules.filter((k) => k !== key);
    }
  }
</script>

<svelte:head><title>Événements</title></svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      <span class="text-epi-pink">Événements</span>
    </h1>
    <p class="text-sm font-bold text-muted-foreground uppercase">
      Configurer les modules, le nom public et les détails de chaque événement
    </p>
  </div>

  <DataTableToolbar
    searchValue={search}
    onSearchInput={(v) => (search = v)}
    searchPlaceholder="Rechercher un événement…"
    filtersAlign="end"
    count={filtered.length}
    countNoun="événement"
    {countSuffix}
  >
    {#snippet filters()}
      <div class="w-full sm:w-56">
        <SearchableSelect
          options={campusOptions}
          value={campusFilter}
          onChange={(v) => (campusFilter = v)}
          allLabel="Tous les campus"
          placeholder="Tous les campus"
          searchPlaceholder="Rechercher un campus…"
          emptyLabel="Aucun campus."
          triggerClass="w-full"
        />
      </div>
      <FilterSelect
        ariaLabel="Filtrer par année scolaire"
        options={yearOptions}
        value={yearFilter}
        onChange={(v) => (yearFilter = v)}
      />
      {#if showTypeFilter}
        <SegmentedFilter
          ariaLabel="Filtrer par type d'événement"
          options={typeOptions}
          value={typeFilter}
          onChange={(v) => (typeFilter = v)}
        />
      {/if}
    {/snippet}

    {#snippet countActions()}
      {#if anyFiltersApplied}
        <Button
          variant="ghost"
          size="sm"
          onclick={resetFilters}
          class="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          <FilterX class="mr-1.5 h-4 w-4" />
          Réinitialiser
        </Button>
      {/if}
    {/snippet}
  </DataTableToolbar>

  <SortableTable
    {columns}
    rows={filtered}
    {sortKey}
    {sortDir}
    onSort={toggleSort}
    rowKey={(e) => e.id}
    stickyHeader
  >
    {#snippet row(e: AdminEventVM)}
      <Table.Cell>
        <span class="block truncate font-bold" title={e.displayName}
          >{e.displayName}</span
        >
        {#if e.publicName}
          <span class="block truncate text-xs text-muted-foreground"
            >{e.titre}</span
          >
        {/if}
      </Table.Cell>
      <Table.Cell class="text-muted-foreground">{e.campusName}</Table.Cell>
      <Table.Cell class="text-xs text-muted-foreground"
        >{e.eventTypeLabel}</Table.Cell
      >
      <Table.Cell class="text-xs text-muted-foreground"
        >{e.dateLabel}</Table.Cell
      >
      <Table.Cell>
        <div class="flex flex-wrap gap-1">
          {#each e.modules as key}
            <Badge variant="secondary" class="text-[10px]"
              >{EVENT_MODULE_DEFS[key]?.label ?? key}</Badge
            >
          {:else}
            <span class="text-xs text-muted-foreground">—</span>
          {/each}
        </div>
      </Table.Cell>
      <Table.Cell class="text-right tabular-nums">{e.participations}</Table.Cell
      >
      <Table.Cell class="text-right">
        <Button
          variant="ghost"
          size="icon"
          onclick={() => openEdit(e)}
          aria-label="Configurer {e.displayName}"
        >
          <Pencil class="h-4 w-4" />
        </Button>
      </Table.Cell>
    {/snippet}

    {#snippet mobileRow(e: AdminEventVM)}
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate font-bold">{e.displayName}</p>
          <p class="truncate text-xs text-muted-foreground">
            {e.campusName} · {e.eventTypeLabel} · {e.dateLabel}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="shrink-0"
          onclick={() => openEdit(e)}
          aria-label="Configurer {e.displayName}"
        >
          <Pencil class="h-4 w-4" />
        </Button>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-1">
        {#each e.modules as key}
          <Badge variant="secondary" class="text-[10px]"
            >{EVENT_MODULE_DEFS[key]?.label ?? key}</Badge
          >
        {:else}
          <span class="text-xs text-muted-foreground">Aucun module</span>
        {/each}
        <span class="ml-auto text-xs text-muted-foreground tabular-nums">
          {e.participations} inscrits
        </span>
      </div>
    {/snippet}

    {#snippet empty()}
      <div class="flex flex-col items-center gap-3 py-6">
        <span
          class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Aucun événement
        </span>
        {#if anyFiltersApplied}
          <Button
            variant="outline"
            size="sm"
            onclick={resetFilters}
            class="rounded-sm"
          >
            Réinitialiser les filtres
          </Button>
        {/if}
      </div>
    {/snippet}
  </SortableTable>

  <Dialog.Root bind:open>
    <Dialog.Content class="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-2xl">
      <Dialog.Header class="border-b px-4 py-4 text-start sm:px-6">
        <Dialog.Title class="flex items-center gap-2">
          <CalendarCog class="h-5 w-5 text-epi-pink" />
          Configurer l'événement
        </Dialog.Title>
        {#if editing}
          <Dialog.Description>
            {editing.campusName} · {editing.eventTypeLabel} · {editing.dateLabel}
          </Dialog.Description>
        {/if}
      </Dialog.Header>
      <form
        method="POST"
        action="?/update"
        use:enhance
        class="flex min-h-0 flex-1 flex-col"
      >
        <input type="hidden" name="id" bind:value={$form.id} />
        <div class="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-6">
          <div class="space-y-2">
            <Label for="publicName">Nom public</Label>
            <Input
              id="publicName"
              name="publicName"
              bind:value={$form.publicName}
              placeholder={editing?.titre ?? 'Ex : Stage de seconde - Février'}
            />
            <p class="text-xs text-muted-foreground">
              Affiché dans l'espace dev et côté talent. Vide : le nom Salesforce
              est utilisé.
            </p>
            {#if $errors.publicName}<span class="text-xs text-destructive"
                >{$errors.publicName}</span
              >{/if}
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <Label for="startTime">Heure d'arrivée des jeunes</Label>
              <Input
                id="startTime"
                name="startTime"
                type="time"
                bind:value={$form.startTime}
              />
              <p class="text-xs text-muted-foreground">
                Vide : l'heure par défaut du type d'événement s'applique.
              </p>
              {#if $errors.startTime}<span class="text-xs text-destructive"
                  >{$errors.startTime}</span
                >{/if}
            </div>
            <div class="space-y-2">
              <Label for="endDate">Date de fin</Label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                min={editing?.startDateKey}
                bind:value={$form.endDate}
              />
              <p class="text-xs text-muted-foreground">
                Salesforce ne fournit que la date de début. Vide : durée par
                défaut (≈ 2 semaines pour un stage, 1 jour sinon).
              </p>
              {#if $errors.endDate}<span class="text-xs text-destructive"
                  >{$errors.endDate}</span
                >{/if}
            </div>
          </div>

          <fieldset class="space-y-3">
            <legend class="text-sm font-bold uppercase">
              Modules de l'événement
            </legend>
            <p class="text-xs text-muted-foreground">
              Les surfaces que cet événement expose dans l'espace dev. Le
              planning n'est pas un module : il apparaît dès qu'un emploi du
              temps existe.
            </p>
            <div class="space-y-2">
              {#each EVENT_MODULE_KEYS as key (key)}
                {@const def = EVENT_MODULE_DEFS[key]}
                <label
                  class="flex cursor-pointer items-start gap-3 rounded-sm border bg-card p-3 hover:border-epi-pink/40"
                >
                  <Checkbox
                    name="modules"
                    value={key}
                    checked={$form.modules.includes(key)}
                    onCheckedChange={(v) => toggleModule(key, v === true)}
                    class="mt-1"
                  />
                  <div class="flex-1 space-y-1">
                    <span class="text-sm font-bold">{def.label}</span>
                    <p class="text-xs text-muted-foreground">
                      {def.description}
                    </p>
                  </div>
                </label>
              {/each}
            </div>
          </fieldset>

          <div class="space-y-2">
            <Label for="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              bind:value={$form.notes}
              rows={3}
              placeholder="Notes internes sur l'événement…"
            />
          </div>
        </div>
        <Dialog.Footer class="border-t px-4 py-4 sm:px-6">
          <Button
            type="submit"
            disabled={$delayed}
            class="bg-epi-pink text-white"
          >
            {$delayed ? 'Sauvegarde…' : 'Enregistrer'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>
</div>
