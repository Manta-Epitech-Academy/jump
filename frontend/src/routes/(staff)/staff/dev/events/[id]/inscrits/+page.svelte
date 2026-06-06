<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import Users from '@lucide/svelte/icons/users';
  import X from '@lucide/svelte/icons/x';
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import FilterX from '@lucide/svelte/icons/filter-x';
  import Download from '@lucide/svelte/icons/download';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { cn } from '$lib/utils';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import EventSalesforceButton from '$lib/components/events/EventSalesforceButton.svelte';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import type {
    ColumnDef,
    SortDir,
  } from '$lib/components/staff/datatable/types';
  import SegmentedFilter, {
    type SegmentOption,
  } from '$lib/components/staff/SegmentedFilter.svelte';
  import SearchableSelect, {
    type SelectOption,
  } from '$lib/components/staff/SearchableSelect.svelte';
  import School from '@lucide/svelte/icons/school';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import StageCountdownCard from '../components/StageCountdownCard.svelte';
  import LyceesBreakdown from '../components/LyceesBreakdown.svelte';
  import InterestsCloud from '../components/InterestsCloud.svelte';
  import { STAGE_SECONDE_LABEL } from '$lib/domain/event';
  import { compareNiveaux, niveauLabel } from '$lib/domain/niveau';
  import {
    RULES_STATUS_LABELS,
    type RulesStatus,
  } from '$lib/domain/stageCompliance';
  import {
    IMAGE_RIGHTS_STATUS_LABELS,
    type ImageRightsStatus,
  } from '$lib/domain/imageRights';
  import type { FlagKey } from '$lib/domain/featureFlags';
  import type { InscritRow, SortKey } from './components/types';

  // Tones tuned for the dark tooltip surface (bg-foreground / text-background):
  // bright teal for done, warm/red tints for the open states.
  const rulesTone = (s: RulesStatus) =>
    s === 'signed'
      ? 'text-epi-teal'
      : s === 'awaiting_parent'
        ? 'text-amber-300'
        : 'text-red-300';
  const imageTone = (s: ImageRightsStatus) =>
    s === 'accepted'
      ? 'text-epi-teal'
      : s === 'refused'
        ? 'text-orange-300'
        : 'text-red-300';

  let { data }: { data: PageData } = $props();

  // Navigation is flat in stage-only mode (we land here, click into a profile),
  // so the breadcrumb is pure noise. It only earns its keep once coding_club
  // adds depth to the workspace.
  const hasCodingClub = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]).has('coding_club'),
  );

  let searchQuery = $state('');
  let niveauFilter = $state<'all' | string>('all');
  let statutFilter = $state<'all' | 'ready' | 'incomplete'>('all');
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
    Boolean(data.origin.lycee) || Boolean(data.origin.interest),
  );

  const columns: ColumnDef[] = [
    { key: 'avatar', label: '', class: 'w-12' },
    { key: 'prenom', label: 'Prénom', sortable: true },
    { key: 'nom', label: 'Nom', sortable: true },
    { key: 'lycee', label: 'Lycée', sortable: true },
    { key: 'niveau', label: 'Niveau', sortable: true },
    { key: 'ready', label: 'Statut', sortable: true, align: 'right' },
  ];

  // Niveau is a one-click segmented filter, but only worth showing when the
  // cohort actually spans more than one level (otherwise "Tous / 2nde" is noise).
  const showNiveauFilter = $derived(data.availableNiveaux.length > 1);
  const niveauOptions: SegmentOption[] = $derived([
    { value: 'all', label: 'Tous' },
    ...data.availableNiveaux.map((n) => ({ value: n, label: niveauLabel(n) })),
  ]);

  const statutOptions: SegmentOption[] = [
    { value: 'all', label: 'Tous' },
    { value: 'ready', label: 'Prêt' },
    { value: 'incomplete', label: 'Incomplet' },
  ];

  // Every lycée in the cohort, ranked by headcount, for the toolbar picker.
  // (Interests have no picker — their sidebar card is read-only.)
  const lyceeOptions = $derived<SelectOption[]>(
    data.lyceeOptions.map((l) => ({
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
      sortKey = key as SortKey;
      sortDir = 'asc';
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

  function compareRows(a: InscritRow, b: InscritRow, key: SortKey): number {
    switch (key) {
      case 'prenom':
        return a.prenom.localeCompare(b.prenom, 'fr');
      case 'nom':
        return a.nom.localeCompare(b.nom, 'fr');
      case 'lycee':
        return (a.schoolName ?? '').localeCompare(b.schoolName ?? '', 'fr');
      case 'niveau':
        if (!a.niveau && !b.niveau) return 0;
        if (!a.niveau) return 1;
        if (!b.niveau) return -1;
        return compareNiveaux(a.niveau, b.niveau);
      case 'ready':
        return a.ready === b.ready ? 0 : a.ready ? 1 : -1;
    }
  }

  const filtered = $derived.by(() => {
    const tokens = norm(searchQuery).split(/\s+/).filter(Boolean);
    const out = data.rows.filter((r) => {
      if (niveauFilter !== 'all' && r.niveau !== niveauFilter) return false;
      if (statutFilter === 'ready' && !r.ready) return false;
      if (statutFilter === 'incomplete' && r.ready) return false;
      if (tokens.length === 0) return true;
      const h = makeHaystack(r);
      return tokens.every((tok) => h.includes(tok));
    });
    out.sort((a, b) => {
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
      a.download = `Inscrits - ${data.event.titre}.xlsx`;
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

<svelte:head>
  <title>{STAGE_SECONDE_LABEL} — Inscrits</title>
</svelte:head>

<!-- Readiness badge tooltip: the two dossier documents at a glance, so staff can
     triage the cohort (who owes a règlement vs a droit-à-l'image) without opening
     each fiche — the fiche stays the place for the full history and next actions. -->
{#snippet dossierBreakdown(r: InscritRow)}
  {@const RulesIcon = r.rulesStatus === 'signed' ? Check : Clock}
  {@const ImageIcon =
    r.imageStatus === 'accepted'
      ? Check
      : r.imageStatus === 'refused'
        ? X
        : Clock}
  <div class="space-y-1.5">
    <p
      class="font-mono text-[10px] font-bold tracking-widest text-background/60 uppercase"
    >
      Dossier administratif
    </p>
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
          imageTone(r.imageStatus),
        )}
      >
        <ImageIcon class="h-3 w-3" />
        {IMAGE_RIGHTS_STATUS_LABELS[r.imageStatus]}
      </span>
    </div>
  </div>
{/snippet}

<div class="space-y-6 pb-10">
  {#if hasCodingClub}
    <PageBreadcrumb
      items={[
        {
          label: STAGE_SECONDE_LABEL,
          href: resolve(`/staff/dev/events/${data.event.id}`),
        },
        { label: 'Inscrits' },
      ]}
    />
  {/if}
  <PageHeader title="Inscrits">
    <EventSalesforceButton externalId={data.event.externalId} />
  </PageHeader>

  {#if data.cohort.total === 0}
    <div
      class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
    >
      <Users class="h-10 w-10 text-muted-foreground opacity-30" />
      <h3
        class="mt-4 text-sm font-bold tracking-widest text-foreground uppercase"
      >
        Aucun stagiaire inscrit
      </h3>
      <p class="mt-1 text-xs font-medium text-muted-foreground">
        Importer une cohorte via la page d'import.
      </p>
      <Button
        variant="outline"
        size="sm"
        href={resolve('/staff/dev/events/import')}
        class="mt-4 rounded-sm"
      >
        Importer
      </Button>
    </div>
  {:else}
    <div class="grid gap-6 lg:grid-cols-10">
      <!-- Left 70% — the cohort table is the working surface. -->
      <div class="space-y-4 lg:col-span-7">
        <DataTableToolbar
          searchValue={searchQuery}
          onSearchInput={(v) => (searchQuery = v)}
          searchPlaceholder="Rechercher un stagiaire…"
          count={filtered.length}
          countNoun="stagiaire"
          {countSuffix}
        >
          {#snippet filters()}
            <div class="flex items-center gap-2">
              <span
                class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
              >
                Statut
              </span>
              <SegmentedFilter
                ariaLabel="Filtrer par statut de dossier"
                options={statutOptions}
                value={statutFilter}
                onChange={(v) => (statutFilter = v as typeof statutFilter)}
              />
            </div>

            {#if showNiveauFilter}
              <div class="flex items-center gap-2">
                <span
                  class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
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
              <div class="w-60">
                <SearchableSelect
                  options={lyceeOptions}
                  value={activeLycee}
                  onChange={selectLycee}
                  allLabel="Tous les lycées"
                  allCount={data.cohort.total}
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

          {#snippet actions()}
            <Button
              variant="outline"
              size="sm"
              onclick={exportXlsx}
              disabled={exporting || filtered.length === 0}
              class="rounded-sm"
            >
              {#if exporting}
                <LoaderCircle class="mr-1.5 h-4 w-4 animate-spin" />
              {:else}
                <Download class="mr-1.5 h-4 w-4" />
              {/if}
              Exporter (XLSX)
            </Button>
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
          rowKey={(r) => r.id}
          rowHref={(r) => resolve(`/staff/dev/students/${r.talentId}`)}
          rowLabel={(r) => `Voir la fiche de ${r.prenom} ${r.nom}`}
          stickyHeader
        >
          {#snippet row(r: InscritRow)}
            <Table.Cell>
              <TalentAvatar
                talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
                size="sm"
              />
            </Table.Cell>
            <Table.Cell class="font-medium">{r.prenom}</Table.Cell>
            <Table.Cell class="font-bold uppercase">{r.nom}</Table.Cell>
            <Table.Cell class="text-sm">
              {#if r.schoolName}
                {r.schoolName}
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
            <Table.Cell class="text-right">
              <Tooltip.Provider delayDuration={150}>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    {#snippet child({ props })}
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
                          r.ready
                            ? 'border-epi-teal/30 bg-epi-teal/10 text-epi-teal-solid'
                            : 'border-epi-orange/30 bg-epi-orange/10 text-epi-orange',
                        )}
                      >
                        {#if r.ready}
                          <Check class="h-3 w-3" />
                          Prêt
                        {:else}
                          <CircleAlert class="h-3 w-3" />
                          Incomplet
                        {/if}
                      </a>
                    {/snippet}
                  </Tooltip.Trigger>
                  <Tooltip.Content class="max-w-64">
                    {@render dossierBreakdown(r)}
                  </Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
            </Table.Cell>
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
      </div>

      <!-- Right 30% — stage overview at a glance: the opening countdown plus the
           origin breakdowns, which are the page's cohort filter surface. Sticky
           within the `<main>` scrollport, with its own height cap + overflow so
           the rail can outgrow the viewport and its bottom card stays reachable
           (otherwise a pinned rail taller than the screen clips its tail). -->
      <aside class="lg:col-span-3">
        <div
          class="space-y-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pr-1"
        >
          <StageCountdownCard
            status={data.countdown.status}
            openDate={data.countdown.openDate}
            endDate={data.countdown.endDate}
            dayN={data.countdown.dayN}
            totalDays={data.countdown.totalDays}
            timezone={data.timezone}
          />

          {#if data.lyceesBreakdown.rows.length > 0}
            <LyceesBreakdown
              eventId={data.event.id}
              breakdown={data.lyceesBreakdown}
              totalParticipations={data.cohort.total}
              interaction="readonly"
            />
          {/if}

          {#if data.interestsCloud.rows.length > 0}
            <InterestsCloud
              eventId={data.event.id}
              breakdown={data.interestsCloud}
              totalParticipations={data.cohort.total}
              interaction="readonly"
              title="Centres d’intérêt tech"
            />
          {/if}
        </div>
      </aside>
    </div>
  {/if}
</div>
