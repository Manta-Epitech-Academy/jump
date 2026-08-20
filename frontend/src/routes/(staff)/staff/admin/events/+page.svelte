<script lang="ts">
  import Database from '@lucide/svelte/icons/database';
  import Pencil from '@lucide/svelte/icons/pencil';
  import FilterX from '@lucide/svelte/icons/filter-x';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import CircleDot from '@lucide/svelte/icons/circle-dot';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import ListChecks from '@lucide/svelte/icons/list-checks';
  import Eye from '@lucide/svelte/icons/eye';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Switch } from '$lib/components/ui/switch';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Table from '$lib/components/ui/table';
  import EventModulesCell from '$lib/components/events/EventModulesCell.svelte';
  import EventModuleIcon from '$lib/components/events/EventModuleIcon.svelte';
  import EventStateBadge from '$lib/components/events/EventStateBadge.svelte';
  import EventConfigWizard from '$lib/components/events/EventConfigWizard.svelte';
  import AdminSfStatusInspectorDialog from '$lib/components/events/AdminSfStatusInspectorDialog.svelte';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import type {
    ColumnDef,
    SortDir,
  } from '$lib/components/staff/datatable/types';
  import { type SegmentOption } from '$lib/components/staff/SegmentedFilter.svelte';
  import FilterSelect from '$lib/components/staff/FilterSelect.svelte';
  import SearchableSelect from '$lib/components/staff/SearchableSelect.svelte';
  import { toast } from 'svelte-sonner';
  import {
    EVENT_MODULE_DEFS,
    EVENT_MODULE_KEYS,
    type EventModuleKey,
  } from '$lib/domain/eventModules';
  import {
    isEventToPrepare,
    type EventConfigState,
  } from '$lib/domain/eventReadiness';
  import { enhance as formEnhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { SvelteSet } from 'svelte/reactivity';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { AdminEventVM } from './+page.server';

  let { data } = $props();

  type StatusFilter = 'upcoming' | 'ongoing' | 'prep' | 'all';

  // ─── Filters + sort (in-memory over the full event list) ──────────────────
  let search = $state('');
  let campusFilter = $state('all');
  let yearFilter = $state('all');
  // Default to the forward-looking view: across hundreds of events the admin's
  // job is preparing what's coming, not scrolling the past graveyard.
  let statusFilter = $state<StatusFilter>('upcoming');
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

  const columns: ColumnDef[] = [
    { key: 'name', label: 'Événement', sortable: true, class: 'w-full' },
    { key: 'state', label: 'État', sortable: true, class: 'w-36' },
    { key: 'campus', label: 'Campus', sortable: true, class: 'w-40' },
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
    { key: 'actions', label: '', align: 'right', class: 'w-24' },
  ];

  // Sort "État" most-work-first: à configurer, then prêt à publier, then visible.
  const STATE_RANK: Record<EventConfigState, number> = {
    unconfigured: 0,
    ready: 1,
    shown: 2,
  };

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
      case 'state':
        return STATE_RANK[a.configState] - STATE_RANK[b.configState];
      case 'date':
        return a.dateTs - b.dateTs;
      case 'participations':
        return a.participations - b.participations;
      default:
        return 0;
    }
  }

  // Everything except the status filter: drives both the KPI tile counts (each
  // tile shows its bucket within the current campus/year/search scope) and,
  // once status is applied, the table rows.
  const baseFiltered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return data.events.filter((e) => {
      if (campusFilter !== 'all' && e.campusId !== campusFilter) return false;
      if (yearFilter !== 'all' && e.schoolYearLabel !== yearFilter)
        return false;
      if (!q) return true;
      return (
        e.displayName.toLowerCase().includes(q) ||
        e.titre.toLowerCase().includes(q) ||
        e.campusName.toLowerCase().includes(q)
      );
    });
  });

  function matchesStatus(e: AdminEventVM): boolean {
    switch (statusFilter) {
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
    const out = baseFiltered.filter(matchesStatus);
    out.sort((a, b) => {
      const c = compareEvents(a, b, sortKey);
      return sortDir === 'asc' ? c : -c;
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

  const STATUS_SUFFIX: Record<StatusFilter, string> = {
    upcoming: 'à venir',
    ongoing: 'en cours',
    prep: 'à préparer',
    all: 'au total',
  };
  const scopeFiltersApplied = $derived(
    search.trim().length > 0 || campusFilter !== 'all' || yearFilter !== 'all',
  );
  const anyFiltersApplied = $derived(
    scopeFiltersApplied || statusFilter !== 'upcoming',
  );
  const countSuffix = $derived(
    STATUS_SUFFIX[statusFilter] + (scopeFiltersApplied ? ' (filtrés)' : ''),
  );

  function resetFilters() {
    search = '';
    campusFilter = 'all';
    yearFilter = 'all';
    statusFilter = 'upcoming';
  }

  // ─── Edit dialog ─────────────────────────────────────────────────────────
  // The config wizard (EventConfigWizard) owns the superform, the two steps and
  // all the per-module sub-options; the page only opens it on the chosen row.
  let open = $state(false);
  let editing = $state<AdminEventVM | null>(null);

  function openEdit(e: AdminEventVM) {
    editing = e;
    open = true;
  }

  // ─── Inspector dialog ───────────────────────────────────────────────────
  let inspectorOpen = $state(false);
  let inspectingEventId = $state<string | null>(null);
  let inspectingEventTitle = $state<string>('');

  function openInspector(e: AdminEventVM) {
    inspectingEventId = e.id;
    inspectingEventTitle = e.displayName;
    inspectorOpen = true;
  }

  // Deep-link from the admin dashboard: `?event=<id>` opens that event's config
  // wizard straight away, then the param is stripped so a reload (or closing the
  // dialog) doesn't reopen it. The dashboard's recent-events feed links here.
  $effect(() => {
    const id = page.url.searchParams.get('event');
    if (!id) return;
    const match = untrack(() => data.events.find((e) => e.id === id));
    if (match) untrack(() => openEdit(match));
    const url = new URL(page.url);
    url.searchParams.delete('event');
    replaceState(url, page.state);
  });

  // ─── Bulk module edit (over the list selection) ──────────────────────────
  const selected = new SvelteSet<string>();
  let bulkOpen = $state(false);
  let bulkSubmitting = $state(false);
  let bulkModules = $state<EventModuleKey[]>([...EVENT_MODULE_KEYS]);

  // How many selected events can actually be shown in the dev space (≥1 module).
  // Activating a section-less event is a no-op there, so this drives both the
  // disabled "Activer" button and the pre-warning when the selection is mixed.
  const selectedActivatable = $derived.by(() => {
    let n = 0;
    for (const e of data.events) {
      if (selected.has(e.id) && e.modules.length > 0) n++;
    }
    return n;
  });
  const selectedNoModules = $derived(selected.size - selectedActivatable);

  function openBulk() {
    // Start from "all on" (the creation preset) each time, so the dialog is a
    // fresh decision rather than carrying the last batch's choice.
    bulkModules = [...EVENT_MODULE_KEYS];
    bulkOpen = true;
  }

  function toggleBulkModule(key: EventModuleKey, checked: boolean) {
    if (checked) {
      if (!bulkModules.includes(key)) bulkModules = [...bulkModules, key];
    } else {
      bulkModules = bulkModules.filter((k) => k !== key);
    }
  }

  const submitBulk: SubmitFunction = () => {
    const count = selected.size;
    bulkSubmitting = true;
    return async ({ result, update }) => {
      bulkSubmitting = false;
      if (result.type === 'success') {
        toast.success(
          `Modules appliqués à ${count} événement${count > 1 ? 's' : ''}.`,
        );
        bulkOpen = false;
        selected.clear();
      } else if (result.type === 'failure') {
        toast.error(
          (result.data?.bulkError as string | undefined) ??
            'Erreur lors de la mise à jour groupée.',
        );
      }
      // Re-run load so the rows reflect the new module sets (and statuses/prep).
      await update();
    };
  };

  // Bulk show/hide in the dev workspace (the activation gate). Binary, so no
  // dialog: two buttons in the selection bar, one SubmitFunction each.
  function bulkActivation(activate: boolean): SubmitFunction {
    return () => {
      const count = selected.size;
      bulkSubmitting = true;
      return async ({ result, update }) => {
        bulkSubmitting = false;
        if (result.type === 'success') {
          const s = (n: number) => (n > 1 ? 's' : '');
          if (!activate) {
            toast.success(
              `${count} événement${s(count)} retiré${s(count)} de l'espace dev.`,
            );
          } else {
            // Section-less events are skipped server-side (activating them shows
            // nothing), so report the real split rather than the click count.
            const activated = (result.data?.bulkActivated as number) ?? 0;
            const skipped = (result.data?.bulkSkipped as number) ?? 0;
            if (activated === 0) {
              toast.error(
                `Aucun événement activé : ${skipped} sans section à afficher.`,
              );
            } else if (skipped > 0) {
              toast.success(
                `${activated} événement${s(activated)} activé${s(activated)} · ${skipped} ignoré${s(skipped)} (aucune section).`,
              );
            } else {
              toast.success(
                `${activated} événement${s(activated)} activé${s(activated)} dans l'espace dev.`,
              );
            }
          }
          selected.clear();
        } else if (result.type === 'failure') {
          toast.error(
            (result.data?.bulkError as string | undefined) ??
              'Erreur lors de la mise à jour groupée.',
          );
        }
        await update();
      };
    };
  }
</script>

<svelte:head><title>Événements</title></svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      <span class="text-epi-tomorrow">Événements</span>
    </h1>
    <p class="text-sm font-bold text-muted-foreground uppercase">
      Configurer les modules, le nom public et les détails de chaque événement
    </p>
  </div>

  <!-- Cockpit band: each tile is a status filter (click to scope the table),
       counted within the current campus/year/type/search selection. -->
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <KpiTile
      label="À venir"
      value={stats.upcoming}
      sub={`${stats.inscrUpcoming} inscrits`}
      icon={CalendarClock}
      tone="blue"
      pressed={statusFilter === 'upcoming'}
      onclick={() => (statusFilter = 'upcoming')}
    />
    <KpiTile
      label="En cours"
      value={stats.ongoing}
      icon={CircleDot}
      tone="teal"
      pressed={statusFilter === 'ongoing'}
      onclick={() => (statusFilter = 'ongoing')}
    />
    <KpiTile
      label="À préparer"
      value={stats.prep}
      icon={TriangleAlert}
      tone="orange"
      helpText="Événements à venir ou en cours pas encore visibles dans l'espace dev : à configurer ou à publier."
      pressed={statusFilter === 'prep'}
      onclick={() => (statusFilter = 'prep')}
    />
    <KpiTile
      label="Tous"
      value={stats.all}
      sub={`${stats.inscrTotal} inscrits`}
      icon={CalendarDays}
      tone="neutral"
      pressed={statusFilter === 'all'}
      onclick={() => (statusFilter = 'all')}
    />
  </div>

  <DataTableToolbar
    searchValue={search}
    onSearchInput={(v) => (search = v)}
    searchPlaceholder="Rechercher un événement…"
    filtersAlign="end"
    count={rows.length}
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

  {#if selected.size > 0}
    <div
      class="flex flex-wrap items-center gap-3 rounded-sm border bg-card px-4 py-2 shadow-sm"
    >
      <span class="text-sm font-bold">
        {selected.size} événement{selected.size > 1 ? 's' : ''} sélectionné{selected.size >
        1
          ? 's'
          : ''}
      </span>
      <Button size="sm" onclick={openBulk} class="rounded-sm">
        <ListChecks class="mr-1.5 h-4 w-4" />
        Modifier les modules
      </Button>
      <form
        method="POST"
        action="?/bulkActivation"
        use:formEnhance={bulkActivation(true)}
      >
        <input type="hidden" name="ids" value={[...selected].join(',')} />
        <input type="hidden" name="activate" value="true" />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={bulkSubmitting || selectedActivatable === 0}
          title={selectedActivatable === 0
            ? "Aucun événement sélectionné n'a de section activée."
            : undefined}
          class="rounded-sm"
        >
          <Eye class="mr-1.5 h-4 w-4" />
          Activer dans l'espace dev
        </Button>
      </form>
      <form
        method="POST"
        action="?/bulkActivation"
        use:formEnhance={bulkActivation(false)}
      >
        <input type="hidden" name="ids" value={[...selected].join(',')} />
        <input type="hidden" name="activate" value="false" />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={bulkSubmitting}
          class="rounded-sm"
        >
          <EyeOff class="mr-1.5 h-4 w-4" />
          Retirer
        </Button>
      </form>
      <Button
        variant="ghost"
        size="sm"
        onclick={() => selected.clear()}
        class="text-muted-foreground hover:text-foreground"
      >
        Tout désélectionner
      </Button>
      {#if selectedNoModules > 0}
        <span
          class="flex w-full items-center gap-1.5 text-[11px] font-medium text-amber-600"
        >
          <TriangleAlert class="h-3.5 w-3.5 shrink-0" />
          {selectedNoModules} sans section ne {selectedNoModules > 1
            ? 'seront pas activés'
            : 'sera pas activé'} (rien à afficher côté dev).
        </span>
      {/if}
    </div>
  {/if}

  <SortableTable
    {columns}
    {rows}
    {sortKey}
    {sortDir}
    onSort={toggleSort}
    rowKey={(e) => e.id}
    onRowClick={(e) => openEdit(e)}
    selectable
    {selected}
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
              class="shrink-0 text-[10px] font-normal text-muted-foreground"
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
      <Table.Cell class="text-right tabular-nums">{e.participations}</Table.Cell
      >
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
          <Button
            variant="ghost"
            size="icon"
            class="text-muted-foreground opacity-60 transition-opacity group-hover/row:opacity-100"
            onclick={(ev) => {
              ev.stopPropagation();
              openEdit(e);
            }}
            aria-label="Configurer {e.displayName}"
          >
            <Pencil class="h-4 w-4" />
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
                class="shrink-0 text-[10px] font-normal text-muted-foreground"
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
          <Button
            variant="ghost"
            size="icon"
            class="relative z-10 shrink-0 text-muted-foreground"
            onclick={(ev) => {
              ev.stopPropagation();
              openEdit(e);
            }}
            aria-label="Configurer {e.displayName}"
          >
            <Pencil class="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-2">
        <EventModulesCell modules={e.modules} />
        <EventStateBadge state={e.configState} past={e.status === 'past'} />
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

  <EventConfigWizard
    bind:open
    {editing}
    formData={data.form}
    feedbackForms={data.feedbackForms}
    formPreviews={data.formPreviews}
    templates={data.templates}
  />

  <AdminSfStatusInspectorDialog
    bind:open={inspectorOpen}
    eventId={inspectingEventId}
    eventTitle={inspectingEventTitle}
  />

  <Dialog.Root bind:open={bulkOpen}>
    <Dialog.Content class="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-lg">
      <Dialog.Header class="border-b px-4 py-4 text-start sm:px-6">
        <Dialog.Title class="flex items-center gap-2">
          <ListChecks class="h-5 w-5 text-epi-tomorrow" />
          Modules en masse
        </Dialog.Title>
        <Dialog.Description>
          {selected.size} événement{selected.size > 1 ? 's' : ''} sélectionné{selected.size >
          1
            ? 's'
            : ''}.
        </Dialog.Description>
      </Dialog.Header>
      <form
        method="POST"
        action="?/bulkModules"
        use:formEnhance={submitBulk}
        class="flex min-h-0 flex-1 flex-col"
      >
        <input type="hidden" name="ids" value={[...selected].join(',')} />
        <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
          <p class="text-xs text-muted-foreground">
            Les événements sélectionnés exposeront <strong>exactement</strong> les
            sections cochées. Cela remplace leur configuration de modules actuelle.
          </p>
          <div class="divide-y rounded-sm border">
            {#each EVENT_MODULE_KEYS as key (key)}
              {@const def = EVENT_MODULE_DEFS[key]}
              {@const checked = bulkModules.includes(key)}
              <label
                for="bulk-{key}"
                class="flex cursor-pointer items-start gap-3 p-3 transition-colors select-none hover:bg-muted/40"
              >
                <span
                  class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border bg-muted/40 text-muted-foreground"
                >
                  <EventModuleIcon module={key} class="size-4" />
                </span>
                <div class="flex-1 space-y-1">
                  <span class="text-sm font-bold">{def.label}</span>
                  <p class="text-xs text-muted-foreground">{def.description}</p>
                </div>
                <Switch
                  id="bulk-{key}"
                  name="modules"
                  value={key}
                  {checked}
                  onCheckedChange={(v) => toggleBulkModule(key, v === true)}
                  class="mt-0.5"
                />
              </label>
            {/each}
          </div>
        </div>
        <Dialog.Footer class="gap-2 border-t px-4 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onclick={() => (bulkOpen = false)}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            disabled={bulkSubmitting}
            class="bg-epi-tomorrow text-white"
          >
            {bulkSubmitting ? 'Application…' : 'Appliquer'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>
</div>
