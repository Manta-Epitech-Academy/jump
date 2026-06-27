<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import Users from '@lucide/svelte/icons/users';
  import X from '@lucide/svelte/icons/x';
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import Unplug from '@lucide/svelte/icons/unplug';
  import FilterX from '@lucide/svelte/icons/filter-x';
  import Download from '@lucide/svelte/icons/download';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import School from '@lucide/svelte/icons/school';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';
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
  import SearchableSelect, {
    type SelectOption,
  } from '$lib/components/staff/SearchableSelect.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import StageCountdownCard from '../../components/StageCountdownCard.svelte';
  import LyceesBreakdown from '../../components/LyceesBreakdown.svelte';
  import InterestsCloud from '../../components/InterestsCloud.svelte';
  import { compareNiveaux, niveauLabel } from '$lib/domain/niveau';
  import { XP_EXPLAINER_FR } from '$lib/domain/xp';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import { formatGivenName } from '$lib/domain/profile';
  import type { EventLifecycleStatus } from '$lib/domain/eventLifecycle';
  import {
    RULES_STATUS_LABELS,
    INSCRIT_STATUS_LABELS,
    type RulesStatus,
    type InscritStatus,
  } from '$lib/domain/stageCompliance';
  import {
    IMAGE_RIGHTS_DISPLAY_LABELS,
    imageRightsDisplayStatus,
    type ImageRightsDisplayStatus,
  } from '$lib/domain/imageRights';
  import type { InscritRow, SortKey, InscritsCohort } from './types';

  // The streamed cohort payload plus the cheap shell values the table/rail need.
  // This component owns all filter/sort/export state, so it mounts only once the
  // data resolves and is the single home for the data-dependent UI.
  let {
    rows,
    availableNiveaux,
    lyceeOptions: lyceeStats,
    lyceesBreakdown,
    interestsCloud,
    cohort,
    origin,
    countdown,
    timezone,
    event,
    showStatutColumn = true,
  }: InscritsCohort & {
    origin: {
      lycee: { nom: string } | null;
      interest: { id: string; nom: string; emoji: string | null } | null;
    };
    countdown: {
      status: EventLifecycleStatus;
      openDate: Date;
      endDate: Date;
      dayN: number;
      totalDays: number;
    };
    timezone: string;
    event: { id: string; titre: string; externalId: string | null };
    // Inscrits sub-option: campuses that don't onboard (e.g. Paris) hide the
    // dossier/statut funnel column so it isn't dead noise. Gates only this column
    // (header, filter, cells) — the talent fiche is untouched.
    showStatutColumn?: boolean;
  } = $props();

  // Status tints for the dossier tooltip. The tooltip surface is bg-foreground,
  // which inverts with the theme: dark in light mode (the bright tints pop) but
  // light (#c9c9c9) in dark mode, where those same bright tints wash out to
  // ~1.2:1. So each bright tint is paired with a darker -900 shade applied via
  // `dark:`, uniform across all four states so they clear WCAG AA (4.5:1) on the
  // light dark-mode surface: teal 5.72, amber 5.48, orange 5.66, red 6.05. The
  // status is also carried by an icon + label, so color is reinforcement only.
  const rulesTone = (s: RulesStatus) =>
    s === 'signed'
      ? 'text-epi-teal dark:text-teal-900'
      : s === 'awaiting_parent'
        ? 'text-amber-300 dark:text-amber-900'
        : 'text-red-300 dark:text-red-900';
  const imageTone = (s: ImageRightsDisplayStatus) =>
    s === 'accepted'
      ? 'text-epi-teal dark:text-teal-900'
      : s === 'refused'
        ? 'text-orange-300 dark:text-orange-900'
        : s === 'awaiting_parent'
          ? 'text-amber-300 dark:text-amber-900'
          : 'text-red-300 dark:text-red-900';

  // Statut badge presentation, one entry per funnel state. Red = never logged in
  // (the most urgent case), amber = connected but dossier in progress, teal =
  // connected with both gates done.
  const INSCRIT_STATUS_BADGE: Record<
    InscritStatus,
    { icon: typeof Check; class: string }
  > = {
    never_connected: {
      icon: Unplug,
      class: 'border-destructive/30 bg-destructive/10 text-destructive',
    },
    in_progress: {
      icon: Clock,
      class: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
    },
    ready: {
      icon: Check,
      class: 'border-epi-teal/30 bg-epi-teal/10 text-epi-teal-solid',
    },
  };

  // Sort order: least-ready first in ascending, so the rows still needing a
  // chase float to the top (never connected before in progress before ready).
  const STATUS_ORDER: Record<InscritStatus, number> = {
    never_connected: 0,
    in_progress: 1,
    ready: 2,
  };

  let searchQuery = $state('');
  let niveauFilter = $state<'all' | string>('all');
  let statutFilter = $state<'all' | InscritStatus>('all');
  // Default mirrors the server's initial order (nom asc), so the first paint
  // needs no client reshuffle and the header arrow matches the rows shown.
  let sortKey = $state<SortKey>('nom');
  let sortDir = $state<SortDir>('asc');

  // Lycée and interest are server-side "origin" facets carried in the URL, so
  // the toolbar pickers, the sidebar breakdowns and the dashboard drill-down all
  // drive one mechanism. They combine (lycée AND interest), so each control sets
  // only its own param and preserves the other. Search / niveau / statut stay
  // client-side refinements layered on top of whatever the origin scopes in.
  const activeLycee = $derived(page.url.searchParams.get('lycee') ?? 'all');
  const originActive = $derived(
    Boolean(origin.lycee) || Boolean(origin.interest),
  );

  // The table runs `table-layout: fixed` (SortableTable `layout="fixed"`) so it
  // can never outgrow its grid track and spill over the overview rail — auto
  // layout did, because `stickyHeader` drops the table's own x-scroll on desktop
  // (it pins the header to the page scroller). Under fixed layout these widths
  // are the budget: the fixed-width columns are honoured first and Lycée
  // (`w-full`) absorbs whatever track is left, truncating its values (school
  // names are the longest, most variable). The fixed widths sum well under the
  // track at the `xl` two-column breakpoint, so Lycée always keeps a usable share.
  const columns = $derived.by<ColumnDef[]>(() => {
    const cols: ColumnDef[] = [
      { key: 'avatar', label: '', class: 'w-12' },
      { key: 'prenom', label: 'Prénom', sortable: true, class: 'w-28' },
      { key: 'nom', label: 'Nom', sortable: true, class: 'w-40' },
      // XP right after the name: it's the engagement signal we want the eye to
      // catch first, shown as a coloured pill (not flush grey data). Defaults to
      // high-to-low so the first click surfaces the most engaged prospects.
      {
        key: 'xp',
        label: 'XP',
        sortable: true,
        class: 'w-24',
        defaultSortDir: 'desc',
      },
      { key: 'lycee', label: 'Lycée', sortable: true, class: 'w-full' },
      { key: 'niveau', label: 'Niveau', sortable: true, class: 'w-24' },
    ];
    // The dossier/statut funnel column is a sub-option (off for non-onboarding
    // campuses). When hidden, the header, its filter and its per-row cell all go.
    if (showStatutColumn)
      cols.push({
        key: 'status',
        label: 'Statut',
        sortable: true,
        class: 'w-28',
      });
    return cols;
  });

  // Niveau is a one-click segmented filter, but only worth showing when the
  // cohort actually spans more than one level (otherwise "Tous / 2nde" is noise).
  const showNiveauFilter = $derived(availableNiveaux.length > 1);
  const niveauOptions: SegmentOption[] = $derived([
    { value: 'all', label: 'Tous' },
    ...availableNiveaux.map((n) => ({ value: n, label: niveauLabel(n) })),
  ]);

  const statutOptions: SegmentOption[] = [
    { value: 'all', label: 'Tous' },
    { value: 'never_connected', label: INSCRIT_STATUS_LABELS.never_connected },
    { value: 'in_progress', label: INSCRIT_STATUS_LABELS.in_progress },
    { value: 'ready', label: INSCRIT_STATUS_LABELS.ready },
  ];

  // Every lycée in the cohort, ranked by headcount, for the toolbar picker.
  // (Interests have no picker — their sidebar card is read-only.)
  const lyceeOptions = $derived<SelectOption[]>(
    lyceeStats.map((l) => ({
      value: l.schoolId,
      label: l.name,
      count: l.count,
    })),
  );

  function selectLycee(value: string) {
    navigateWithParams({ lycee: value === 'all' ? '' : value });
  }

  function toggleSort(key: string) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      // First click on a new column opens in its natural direction (XP starts
      // high-to-low to surface the most engaged; text columns climb A→Z).
      sortKey = key as SortKey;
      sortDir = columns.find((c) => c.key === key)?.defaultSortDir ?? 'asc';
    }
  }

  function navigateWithParams(params: Record<string, string>) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    goto(url.toString(), { keepFocus: true, noScroll: true });
  }

  function resetFilters() {
    searchQuery = '';
    niveauFilter = 'all';
    statutFilter = 'all';
    // Origin lives in the URL, so clearing it is a navigation, not state.
    if (originActive) navigateWithParams({ lycee: '', interest: '' });
  }

  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function makeHaystack(r: InscritRow): string {
    return norm(
      [
        r.nom,
        r.prenom,
        niveauLabel(r.niveau),
        r.schoolName,
        r.email,
        r.parentEmail,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  // Rows with no value for the active sort key always sink to the bottom, in
  // either direction: sorting by Lycée (or Niveau) should surface the rows that
  // *have* one, never lead with a block of "—". So this rule sits outside the
  // asc/desc flip below; `compareRows` then only ever sees present values.
  function sortsLast(r: InscritRow, key: SortKey): boolean {
    if (key === 'lycee') return !r.schoolName;
    if (key === 'niveau') return !r.niveau;
    return false;
  }

  function compareRows(a: InscritRow, b: InscritRow, key: SortKey): number {
    switch (key) {
      case 'prenom':
        return a.prenom.localeCompare(b.prenom, 'fr');
      case 'nom':
        return a.nom.localeCompare(b.nom, 'fr');
      case 'lycee':
        return (a.schoolName ?? '').localeCompare(b.schoolName ?? '', 'fr');
      case 'niveau':
        return compareNiveaux(a.niveau ?? '', b.niveau ?? '');
      case 'xp':
        return a.xp - b.xp;
      case 'status':
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    }
  }

  const filtered = $derived.by(() => {
    const tokens = norm(searchQuery).split(/\s+/).filter(Boolean);
    const out = rows.filter((r) => {
      if (niveauFilter !== 'all' && r.niveau !== niveauFilter) return false;
      if (statutFilter !== 'all' && r.status !== statutFilter) return false;
      if (tokens.length === 0) return true;
      const h = makeHaystack(r);
      return tokens.every((tok) => h.includes(tok));
    });
    out.sort((a, b) => {
      const aLast = sortsLast(a, sortKey);
      const bLast = sortsLast(b, sortKey);
      if (aLast !== bLast) return aLast ? 1 : -1;
      const c = compareRows(a, b, sortKey);
      return sortDir === 'asc' ? c : -c;
    });
    return out;
  });

  const clientFiltersApplied = $derived(
    searchQuery.trim().length > 0 ||
      niveauFilter !== 'all' ||
      statutFilter !== 'all',
  );
  const anyFiltersApplied = $derived(clientFiltersApplied || originActive);

  const countSuffix = $derived(
    anyFiltersApplied
      ? filtered.length > 1
        ? 'correspondent aux filtres'
        : 'correspond aux filtres'
      : 'au total',
  );

  let exporting = $state(false);

  // Export exactly the rows the dev is looking at (current filters + sort): POST
  // their talent ids in display order to the export endpoint, which builds the
  // XLSX server-side, then download the returned file.
  async function exportXlsx() {
    if (exporting || filtered.length === 0) return;
    exporting = true;
    try {
      const res = await fetch(`${page.url.pathname}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ talentIds: filtered.map((r) => r.talentId) }),
      });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Inscrits - ${event.titre}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('export xlsx', e);
      toast.error("Échec de l'export.");
    } finally {
      exporting = false;
    }
  }
</script>

<!-- Statut badge tooltip: the three triage signals at a glance (did the student
     connect, do they still owe a règlement, a droit-à-l'image), so staff can
     triage the cohort without opening each fiche — the fiche stays the place for
     the full history and next actions. -->
{#snippet statusBreakdown(r: InscritRow)}
  {@const RulesIcon = r.rulesStatus === 'signed' ? Check : Clock}
  {@const imageDisplay = imageRightsDisplayStatus(
    r.imageStatus,
    r.studentSigned,
  )}
  {@const ImageIcon =
    imageDisplay === 'accepted'
      ? Check
      : imageDisplay === 'refused'
        ? X
        : Clock}
  <div class="space-y-1.5">
    <div class="flex items-center justify-between gap-6">
      <span class="text-background/70">Connexion</span>
      <span
        class={cn(
          'inline-flex items-center gap-1 font-bold',
          r.connected
            ? 'text-epi-teal dark:text-teal-900'
            : 'text-red-300 dark:text-red-900',
        )}
      >
        {#if r.connected}
          <Check class="h-3 w-3" />
          Connecté
        {:else}
          <X class="h-3 w-3" />
          Jamais connecté
        {/if}
      </span>
    </div>
    <div class="flex items-center justify-between gap-6">
      <span class="text-background/70">Règlement intérieur</span>
      <span
        class={cn(
          'inline-flex items-center gap-1 font-bold',
          rulesTone(r.rulesStatus),
        )}
      >
        <RulesIcon class="h-3 w-3" />
        {RULES_STATUS_LABELS[r.rulesStatus]}
      </span>
    </div>
    <div class="flex items-center justify-between gap-6">
      <span class="text-background/70">Droit à l'image</span>
      <span
        class={cn(
          'inline-flex items-center gap-1 font-bold',
          imageTone(imageDisplay),
        )}
      >
        <ImageIcon class="h-3 w-3" />
        {IMAGE_RIGHTS_DISPLAY_LABELS[imageDisplay]}
      </span>
    </div>
  </div>
{/snippet}

{#if cohort.total === 0}
  <div
    class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
  >
    <Users class="h-10 w-10 text-muted-foreground opacity-30" />
    <h3
      class="mt-4 text-sm font-bold tracking-widest text-foreground uppercase"
    >
      Aucun stagiaire inscrit
    </h3>
    <!-- The cohort is synced from Salesforce by the worker, not imported by
         hand, so there is no manual-import action here. -->
    <p class="mt-1 max-w-sm text-xs font-medium text-muted-foreground">
      Les stagiaires sont synchronisés automatiquement depuis Salesforce et
      apparaîtront ici une fois la synchronisation effectuée.
    </p>
  </div>
{:else}
  <!-- Two-column (70/30) split is held back to `xl`: a 6-column roster plus
       the overview rail simply doesn't fit side by side on a `lg` laptop once
       the app sidebar + page padding are taken out, so below `xl` the table
       takes the full width and the rail drops beneath it. -->
  <div class="grid gap-6 xl:grid-cols-10">
    <!-- Left 70% — the cohort table is the working surface. `min-w-0` is
         load-bearing: as a grid item it defaults to `min-width: auto`, which
         would refuse to shrink below the table's intrinsic (6-column) width
         and blow the whole grid past the viewport. With `min-w-0` it shrinks
         to the track; the table's own fixed layout then divides that track
         among its columns rather than overflowing it. -->
    <div class="min-w-0 space-y-4 xl:col-span-7">
      <DataTableToolbar
        searchValue={searchQuery}
        onSearchInput={(v) => (searchQuery = v)}
        searchPlaceholder="Rechercher un stagiaire…"
        searchWidthClass="w-full max-w-[230px]"
        filtersAlign="end"
        count={filtered.length}
        countNoun="stagiaire"
        {countSuffix}
      >
        {#snippet filters()}
          {#if showStatutColumn}
            <div class="flex items-center gap-2">
              <span
                class="hidden text-[10px] font-bold tracking-widest text-muted-foreground uppercase sm:inline"
              >
                Statut
              </span>
              <FilterSelect
                ariaLabel="Filtrer par statut de dossier"
                options={statutOptions}
                value={statutFilter}
                onChange={(v) => (statutFilter = v as typeof statutFilter)}
              />
            </div>
          {/if}

          {#if showNiveauFilter}
            <div class="flex items-center gap-2">
              <span
                class="hidden text-[10px] font-bold tracking-widest text-muted-foreground uppercase sm:inline"
              >
                Niveau
              </span>
              <SegmentedFilter
                ariaLabel="Filtrer par niveau scolaire"
                options={niveauOptions}
                value={niveauFilter}
                onChange={(v) => (niveauFilter = v)}
              />
            </div>
          {/if}

          {#if lyceeOptions.length > 0}
            <div class="w-full sm:w-60">
              <SearchableSelect
                options={lyceeOptions}
                value={activeLycee}
                onChange={selectLycee}
                allLabel="Tous les lycées"
                allCount={cohort.total}
                placeholder="Tous les lycées"
                searchPlaceholder="Rechercher un lycée…"
                emptyLabel="Aucun lycée."
                triggerClass="w-full"
                contentClass="w-96"
              >
                {#snippet icon()}
                  <School class="h-4 w-4 text-muted-foreground" />
                {/snippet}
              </SearchableSelect>
            </div>
          {/if}
        {/snippet}

        {#snippet countActions()}
          <!-- Réinitialiser sits inline right after the count it clears, so the
               control reads against the number it acts on. Export keeps to the
               right edge of the same line (ml-auto), acting on exactly the count
               shown; the statut + lycée filters live on the search row above,
               so this line never gets crowded. -->
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
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="outline"
                    size="sm"
                    onclick={exportXlsx}
                    disabled={exporting || filtered.length === 0}
                    class="ml-auto rounded-sm"
                  >
                    {#if exporting}
                      <LoaderCircle class="mr-1.5 h-4 w-4 animate-spin" />
                    {:else}
                      <Download class="mr-1.5 h-4 w-4" />
                    {/if}
                    Exporter (XLSX)
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content class="max-w-60 rounded-sm">
                {@const noun = filtered.length > 1 ? 'stagiaires' : 'stagiaire'}
                <p>
                  {#if anyFiltersApplied}
                    Exporte les {filtered.length}
                    {noun} actuellement affichés (filtres et tri appliqués), pas toute
                    la cohorte.
                  {:else}
                    Exporte toute la cohorte ({filtered.length}
                    {noun}).
                  {/if}
                </p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        {/snippet}
      </DataTableToolbar>

      <!-- One provider for the whole table: it only carries the hover-delay
           config, so the per-row badge tooltips share a single instance rather
           than spinning up one provider per cohort row (~200 at full stage). -->
      <Tooltip.Provider delayDuration={150}>
        <SortableTable
          {columns}
          rows={filtered}
          {sortKey}
          {sortDir}
          onSort={toggleSort}
          rowKey={(r) => r.id}
          rowHref={(r) => resolve(`/staff/dev/students/${r.talentId}`)}
          rowLabel={(r) => `Voir la fiche de ${r.prenom} ${r.nom}`}
          stickyHeader
          layout="fixed"
        >
          {#snippet row(r: InscritRow)}
            <Table.Cell>
              <TalentAvatar
                talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
                size="sm"
              />
            </Table.Cell>
            <!-- prénom/nom truncate within their fixed columns: realistic names
               fit, but a freak-long one ellipsizes inside its cell (full value
               on hover) instead of bleeding into the neighbouring column. -->
            <Table.Cell class="font-medium">
              {@const prenom = formatGivenName(r.prenom)}
              <span class="block truncate" title={prenom}>{prenom}</span>
            </Table.Cell>
            <Table.Cell class="font-bold uppercase">
              <span class="block truncate" title={r.nom}>{r.nom}</span>
            </Table.Cell>
            <Table.Cell>
              <!-- XP as a coloured pill right beside the name: the engagement
                   signal reads at a glance, not as flush grey data. Still the
                   row-link anchor (relative z-10) with the hover explainer like
                   the status badge; click opens the fiche, tabindex=-1 keeps one
                   tab stop. Rides the table-level Tooltip.Provider. -->
              <Tooltip.Root>
                <Tooltip.Trigger>
                  {#snippet child({ props })}
                    <a
                      {...props}
                      href={resolve(`/staff/dev/students/${r.talentId}`)}
                      tabindex={-1}
                      class="relative z-10 inline-flex items-center gap-1 rounded-full bg-epi-teal-solid/10 px-2 py-0.5 text-xs font-bold text-epi-teal-solid tabular-nums"
                    >
                      <Sparkles class="h-3 w-3" />
                      {r.xp}
                    </a>
                  {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content class="max-w-60">
                  <p class="text-xs">{XP_EXPLAINER_FR}</p>
                </Tooltip.Content>
              </Tooltip.Root>
            </Table.Cell>
            <Table.Cell class="text-sm">
              {#if r.schoolName}
                <!-- Some school names run very long (e.g. "Section d'enseignement
                   général et technologique du Lycée agricole …"). Under fixed
                   layout the Lycée column owns a definite width, so the inner
                   block truncates cleanly to it; full name on hover. -->
                <span class="block truncate" title={r.schoolName}>
                  {r.schoolName}
                </span>
              {:else}
                <span class="text-muted-foreground">—</span>
              {/if}
            </Table.Cell>
            <Table.Cell>
              {#if r.niveau}
                <Badge
                  variant="secondary"
                  class="rounded-sm bg-epi-blue/5 px-2 py-0 text-[10px] font-bold text-epi-blue uppercase"
                >
                  {niveauLabel(r.niveau)}
                </Badge>
              {:else}
                <span class="text-sm text-muted-foreground">—</span>
              {/if}
            </Table.Cell>
            {#if showStatutColumn}
              <Table.Cell>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
                      {@const badge = INSCRIT_STATUS_BADGE[r.status]}
                      {@const BadgeIcon = badge.icon}
                      <!-- The badge IS the row link: relative z-10 lifts it above
                           the stretched-link overlay so it both fires the tooltip
                           on hover and navigates to the fiche on click (cmd/middle
                           click included). tabindex=-1 keeps a single tab stop per
                           row — the overlay link already covers keyboard nav. -->
                      <a
                        {...props}
                        href={resolve(`/staff/dev/students/${r.talentId}`)}
                        tabindex={-1}
                        class={cn(
                          'relative z-10 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                          badge.class,
                        )}
                      >
                        <BadgeIcon class="h-3 w-3" />
                        {INSCRIT_STATUS_LABELS[r.status]}
                      </a>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content class="max-w-64">
                    {@render statusBreakdown(r)}
                  </Tooltip.Content>
                </Tooltip.Root>
              </Table.Cell>
            {/if}
          {/snippet}

          <!-- Mobile card (below lg): the fixed 6-column roster can't fit a phone,
               so the row folds to avatar + name with the status badge top-right,
               then lycée + niveau beneath. The whole card links to the fiche via
               SortableTable's `rowHref`, so the badge stays a plain span here. -->
          {#snippet mobileRow(r: InscritRow)}
            {@const prenom = formatGivenName(r.prenom)}
            {@const badge = INSCRIT_STATUS_BADGE[r.status]}
            {@const BadgeIcon = badge.icon}
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
                  <div class="flex shrink-0 items-center gap-1.5">
                    <span
                      class="inline-flex items-center gap-1 rounded-full bg-epi-teal-solid/10 px-2 py-0.5 text-[10px] font-bold text-epi-teal-solid tabular-nums"
                    >
                      <Sparkles class="h-3 w-3" />
                      {r.xp}
                    </span>
                    {#if showStatutColumn}
                      <span
                        class={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                          badge.class,
                        )}
                      >
                        <BadgeIcon class="h-3 w-3" />
                        {INSCRIT_STATUS_LABELS[r.status]}
                      </span>
                    {/if}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span
                    class="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                  >
                    {r.schoolName || '—'}
                  </span>
                  {#if r.niveau}
                    <Badge
                      variant="secondary"
                      class="shrink-0 rounded-sm bg-epi-blue/5 px-2 py-0 text-[10px] font-bold text-epi-blue uppercase"
                    >
                      {niveauLabel(r.niveau)}
                    </Badge>
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
      </Tooltip.Provider>
    </div>

    <!-- Right 30% (xl+) — stage overview at a glance: the opening countdown
         plus the origin breakdowns, which are the page's cohort filter
         surface. At `xl` it's the sticky right column, with its own height cap
         + overflow so the rail can outgrow the viewport and its bottom card
         stays reachable (otherwise a pinned rail taller than the screen clips
         its tail). -->
    <!-- Content-first below `xl`: the search + list (the reason you open this
         page) come first; this overview rail (countdown + breakdowns, the
         glanceable secondary info) follows below, its cards laid side by side
         so the full width reads as intentional rather than a stretched stack.
         At `xl` the grid folds to one column → the sticky vertical rail. -->
    <aside class="min-w-0 xl:col-span-3">
      <div
        class="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-6rem)] xl:grid-cols-1 xl:overflow-y-auto xl:pr-1"
      >
        <StageCountdownCard
          status={countdown.status}
          openDate={countdown.openDate}
          endDate={countdown.endDate}
          dayN={countdown.dayN}
          totalDays={countdown.totalDays}
          {timezone}
        />

        {#if lyceesBreakdown.rows.length > 0}
          <LyceesBreakdown
            eventId={event.id}
            breakdown={lyceesBreakdown}
            totalParticipations={cohort.total}
            interaction="readonly"
          />
        {/if}

        {#if interestsCloud.rows.length > 0}
          <InterestsCloud
            eventId={event.id}
            breakdown={interestsCloud}
            totalParticipations={cohort.total}
            interaction="readonly"
            title="Centres d’intérêt tech"
          />
        {/if}
      </div>
    </aside>
  </div>
{/if}
