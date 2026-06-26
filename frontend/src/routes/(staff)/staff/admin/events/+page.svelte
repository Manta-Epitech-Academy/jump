<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import CalendarCog from '@lucide/svelte/icons/calendar-cog';
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
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Badge } from '$lib/components/ui/badge';
  import { Switch } from '$lib/components/ui/switch';
  import { TimePicker } from '$lib/components/ui/time-picker';
  import { DatePicker } from '$lib/components/ui/date-picker';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import * as Table from '$lib/components/ui/table';
  import EventModulesCell from '$lib/components/events/EventModulesCell.svelte';
  import EventModuleIcon from '$lib/components/events/EventModuleIcon.svelte';
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
  import { effectiveStartMinutes, minutesToHHMM } from '$lib/domain/event';
  import { EVENT_PREP_REASON_LABELS } from '$lib/domain/eventReadiness';
  import { enhance as formEnhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { SvelteSet } from 'svelte/reactivity';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import type { AdminEventVM } from './+page.server';

  let { data } = $props();

  type StatusFilter = 'upcoming' | 'ongoing' | 'prep' | 'all';

  // ─── Filters + sort (in-memory over the full event list) ──────────────────
  let search = $state('');
  let campusFilter = $state('all');
  let yearFilter = $state('all');
  let typeFilter = $state('all');
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

  // Everything except the status filter: drives both the KPI tile counts (each
  // tile shows its bucket within the current campus/year/type/search scope) and,
  // once status is applied, the table rows.
  const baseFiltered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return data.events.filter((e) => {
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
  });

  function matchesStatus(e: AdminEventVM): boolean {
    switch (statusFilter) {
      case 'upcoming':
        return e.status === 'upcoming';
      case 'ongoing':
        return e.status === 'ongoing';
      // prepReasons is already empty for past events, so length alone is enough.
      case 'prep':
        return e.prepReasons.length > 0;
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
      if (e.prepReasons.length > 0) prep++;
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
    search.trim().length > 0 ||
      campusFilter !== 'all' ||
      yearFilter !== 'all' ||
      typeFilter !== 'all',
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
    typeFilter = 'all';
    statusFilter = 'upcoming';
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

  // The type's fallback hour ("10:00" stage / "14:00" coding club), shown in the
  // dialog so staff see what applies until they confirm a real one.
  const defaultStartTime = $derived(
    editing
      ? minutesToHHMM(effectiveStartMinutes(editing.eventType, null))
      : '',
  );

  function openEdit(e: AdminEventVM) {
    editing = e;
    $form.id = e.id;
    $form.publicName = e.publicName;
    $form.startTime = e.startTime;
    $form.endDate = e.endDate;
    $form.notes = e.notes;
    $form.modules = [...e.modules];
    $form.devActivated = e.devActivated;
    $form.feedbackFormId = e.feedbackFormId;
    open = true;
  }

  // ─── Feedback form picker (used by the bilan module) ─────────────────────
  // '' (use the type default) maps to a sentinel because bits-ui Select wants a
  // non-empty value; mapped back on change. The default label names the form the
  // event type resolves to when no override is set.
  const NO_FORM = 'default';
  const feedbackDefaultLabel = $derived.by(() => {
    const t = editing ? data.defaultFormTitleByType[editing.eventType] : '';
    return t
      ? `Par défaut (${t})`
      : 'Par défaut (aucun formulaire pour ce type)';
  });
  const feedbackTriggerLabel = $derived(
    $form.feedbackFormId
      ? (data.feedbackForms.find((f) => f.value === $form.feedbackFormId)
          ?.label ?? 'Formulaire inconnu')
      : feedbackDefaultLabel,
  );

  function toggleModule(key: EventModuleKey, checked: boolean) {
    if (checked) {
      if (!$form.modules.includes(key)) $form.modules = [...$form.modules, key];
    } else {
      $form.modules = $form.modules.filter((k) => k !== key);
    }
  }

  // ─── Bulk module edit (over the list selection) ──────────────────────────
  const selected = new SvelteSet<string>();
  let bulkOpen = $state(false);
  let bulkSubmitting = $state(false);
  let bulkModules = $state<EventModuleKey[]>([...EVENT_MODULE_KEYS]);

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
      const plural = count > 1 ? 's' : '';
      bulkSubmitting = true;
      return async ({ result, update }) => {
        bulkSubmitting = false;
        if (result.type === 'success') {
          toast.success(
            activate
              ? `${count} événement${plural} activé${plural} dans l'espace dev.`
              : `${count} événement${plural} retiré${plural} de l'espace dev.`,
          );
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
      <span class="text-epi-pink">Événements</span>
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
      helpText="Événements à venir ou en cours auxquels il manque l'heure d'arrivée ou des sections à activer."
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
          disabled={bulkSubmitting}
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
    </div>
  {/if}

  {#snippet prepChip(e: AdminEventVM)}
    {#if e.prepReasons.length > 0}
      <Tooltip.Provider delayDuration={200}>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Badge
                {...props}
                variant="outline"
                class="border-amber-500/50 text-[10px] font-normal text-amber-600"
              >
                À préparer
              </Badge>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>
            <ul class="space-y-0.5">
              {#each e.prepReasons as r (r)}
                <li>{EVENT_PREP_REASON_LABELS[r]}</li>
              {/each}
            </ul>
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    {/if}
  {/snippet}

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
          {#if e.devActivated}
            <Badge
              variant="outline"
              class="shrink-0 border-emerald-500/40 text-[10px] font-normal text-emerald-600"
            >
              Espace dev
            </Badge>
          {/if}
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
      <Table.Cell class="text-muted-foreground">{e.campusName}</Table.Cell>
      <Table.Cell class="text-xs text-muted-foreground"
        >{e.eventTypeLabel}</Table.Cell
      >
      <Table.Cell class="text-xs text-muted-foreground">
        <div class="flex flex-col items-start gap-1">
          <span>{e.dateLabel}{e.startTime ? ` · ${e.startTime}` : ''}</span>
          {@render prepChip(e)}
        </div>
      </Table.Cell>
      <Table.Cell>
        <EventModulesCell modules={e.modules} />
      </Table.Cell>
      <Table.Cell class="text-right tabular-nums">{e.participations}</Table.Cell
      >
      <Table.Cell class="text-right">
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
      </Table.Cell>
    {/snippet}

    {#snippet mobileRow(e: AdminEventVM)}
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="truncate font-bold">{e.displayName}</p>
            {#if e.devActivated}
              <Badge
                variant="outline"
                class="shrink-0 border-emerald-500/40 text-[10px] font-normal text-emerald-600"
              >
                Espace dev
              </Badge>
            {/if}
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
            {e.campusName} · {e.eventTypeLabel} · {e.dateLabel}
          </p>
        </div>
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
      <div class="mt-3 flex items-center gap-2">
        <EventModulesCell modules={e.modules} />
        {@render prepChip(e)}
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
          <label
            for="devActivated"
            class="flex cursor-pointer items-start gap-3 rounded-sm border p-3 transition-colors select-none {$form.devActivated
              ? 'border-epi-pink/40 bg-epi-pink/5'
              : 'hover:bg-muted/40'}"
          >
            <div class="flex-1 space-y-1">
              <span class="text-sm font-bold">Visible dans l'espace dev</span>
              <p class="text-xs text-muted-foreground">
                Tant que c'est désactivé, l'équipe dev ne voit pas cet
                événement, même configuré. Activez-le quand il est prêt.
              </p>
            </div>
            <Switch
              id="devActivated"
              name="devActivated"
              value="true"
              checked={$form.devActivated}
              onCheckedChange={(v) => ($form.devActivated = v === true)}
              class="mt-0.5"
            />
          </label>

          <div class="space-y-2">
            <Label for="publicName">Nom public</Label>
            <Input
              id="publicName"
              name="publicName"
              bind:value={$form.publicName}
              placeholder={editing?.titre ?? 'Ex : Stage de seconde - Février'}
            />
            <p class="text-xs text-muted-foreground">
              {#if $form.publicName.trim()}
                Ce nom est vu par le staff et par les jeunes, à la place du nom
                importé de Salesforce.
              {:else}
                Pour l'instant, c'est le nom importé de Salesforce qui
                s'affiche. Donnez-lui un nom plus parlant : il sera vu par le
                staff comme par les jeunes.
              {/if}
            </p>
            {#if $errors.publicName}<span class="text-xs text-destructive"
                >{$errors.publicName}</span
              >{/if}
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <!-- Fixed-height label row so the optional "À confirmer" badge
                   can't grow this column taller than the bare-label column
                   next to it, which would shove the control below out of line
                   with its neighbour. The endDate column mirrors this height. -->
              <div class="flex h-6 items-center gap-2">
                <Label for="startTime">Heure d'arrivée des jeunes</Label>
                {#if !$form.startTime}
                  <Badge
                    variant="outline"
                    class="border-amber-500/50 text-[10px] leading-none font-normal text-amber-600"
                  >
                    À confirmer
                  </Badge>
                {/if}
              </div>
              <TimePicker
                id="startTime"
                name="startTime"
                bind:value={$form.startTime}
              />
              <p class="text-xs text-muted-foreground">
                Tant qu'elle n'est pas renseignée, les jeunes ne voient que la
                date, sans heure. Le staff, lui, voit l'horaire par défaut{defaultStartTime
                  ? ` (${defaultStartTime})`
                  : ''} en attendant.
              </p>
              {#if $errors.startTime}<span class="text-xs text-destructive"
                  >{$errors.startTime}</span
                >{/if}
            </div>
            <div class="space-y-2">
              <!-- Same fixed-height label row as the startTime column so both
                   controls in this grid line up, badge or not. -->
              <div class="flex h-6 items-center">
                <Label for="endDate">Date de fin</Label>
              </div>
              <DatePicker
                id="endDate"
                name="endDate"
                min={editing?.startDateKey}
                placeholder="Durée par défaut"
                bind:value={$form.endDate}
              />
              <p class="text-xs text-muted-foreground">
                L'import Salesforce ne donne que la date de début. Laissez vide
                pour la durée par défaut (≈ 2 semaines pour un stage, 1 jour
                pour les autres).
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
              Choisissez les sections que le staff verra pour cet événement, et
              n'activez que celles qui vous servent. Le planning n'est pas dans
              la liste : il apparaît tout seul dès qu'un emploi du temps est
              défini.
            </p>
            <div class="divide-y rounded-sm border">
              {#each EVENT_MODULE_KEYS as key (key)}
                {@const def = EVENT_MODULE_DEFS[key]}
                {@const checked = $form.modules.includes(key)}
                <!-- The whole row is a <label for> the switch, so clicking
                     anywhere (icon, title, description) toggles it. The switch
                     stays the focusable control; a <span> title avoids an
                     invalid nested <label>. -->
                <label
                  for="module-{key}"
                  class="flex cursor-pointer items-start gap-3 p-3 transition-colors select-none hover:bg-muted/40"
                >
                  <span
                    class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border bg-muted/40 text-muted-foreground"
                  >
                    <EventModuleIcon module={key} class="size-4" />
                  </span>
                  <div class="flex-1 space-y-1">
                    <span class="text-sm font-bold">{def.label}</span>
                    <p class="text-xs text-muted-foreground">
                      {def.description}
                    </p>
                  </div>
                  <Switch
                    id="module-{key}"
                    name="modules"
                    value={key}
                    {checked}
                    onCheckedChange={(v) => toggleModule(key, v === true)}
                    class="mt-0.5"
                  />
                </label>
              {/each}
            </div>
          </fieldset>

          <div class="space-y-2">
            <Label for="feedbackFormId">Formulaire de feedback</Label>
            <!-- Always-present hidden field so the binding is posted (and kept)
                 on every save, even if the picker is left untouched; the Select
                 drives its value. Empty = use the type default. -->
            <input
              type="hidden"
              name="feedbackFormId"
              value={$form.feedbackFormId}
            />
            <Select.Root
              type="single"
              value={$form.feedbackFormId || NO_FORM}
              onValueChange={(v) =>
                ($form.feedbackFormId = v === NO_FORM ? '' : v)}
            >
              <Select.Trigger id="feedbackFormId" class="w-full">
                {feedbackTriggerLabel}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={NO_FORM}>{feedbackDefaultLabel}</Select.Item
                >
                {#each data.feedbackForms as opt (opt.value)}
                  <Select.Item value={opt.value}>{opt.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <p class="text-xs text-muted-foreground">
              Le formulaire que les jeunes remplissent pour cet événement
              (module Feedback). « Par défaut » utilise le formulaire associé au
              type d'événement.
            </p>
          </div>

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
        <Dialog.Footer class="gap-2 border-t px-4 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onclick={() => (open = false)}
          >
            Annuler
          </Button>
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

  <Dialog.Root bind:open={bulkOpen}>
    <Dialog.Content class="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-lg">
      <Dialog.Header class="border-b px-4 py-4 text-start sm:px-6">
        <Dialog.Title class="flex items-center gap-2">
          <ListChecks class="h-5 w-5 text-epi-pink" />
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
            class="bg-epi-pink text-white"
          >
            {bulkSubmitting ? 'Application…' : 'Appliquer'}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>
</div>
