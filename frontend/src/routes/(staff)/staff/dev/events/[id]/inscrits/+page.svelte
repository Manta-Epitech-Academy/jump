<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { toast } from 'svelte-sonner';
  import Users from '@lucide/svelte/icons/users';
  import X from '@lucide/svelte/icons/x';
  import Check from '@lucide/svelte/icons/check';
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import FilterX from '@lucide/svelte/icons/filter-x';
  import Download from '@lucide/svelte/icons/download';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
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
  import { STAGE_SECONDE_LABEL } from '$lib/domain/event';
  import { compareNiveaux, niveauLabel } from '$lib/domain/niveau';
  import type { FlagKey } from '$lib/domain/featureFlags';
  import type { InscritRow, SortKey } from './components/types';

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
  let lyceeFilter = $state<'all' | string>('all');
  // Default mirrors the server's initial order (nom asc), so the first paint
  // needs no client reshuffle and the header arrow matches the rows shown.
  let sortKey = $state<SortKey>('nom');
  let sortDir = $state<SortDir>('asc');

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

  // Lycées present in the cohort, searchable (the list can be long).
  const lyceeOptions = $derived<SelectOption[]>(
    Array.from(
      new Set(
        data.rows.map((r) => r.schoolName).filter((s): s is string => !!s),
      ),
    )
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .map((name) => ({ value: name, label: name })),
  );

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

  function resetClientFilters() {
    searchQuery = '';
    niveauFilter = 'all';
    statutFilter = 'all';
    lyceeFilter = 'all';
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
      if (lyceeFilter !== 'all' && r.schoolName !== lyceeFilter) return false;
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
      statutFilter !== 'all' ||
      lyceeFilter !== 'all',
  );

  const countSuffix = $derived(
    clientFiltersApplied
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

  {#if data.origin.lycee || data.origin.interest}
    <div class="flex flex-wrap items-center gap-2">
      <span
        class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Filtré par
      </span>
      {#if data.origin.lycee}
        <span
          class="inline-flex items-center gap-1.5 rounded-sm border border-epi-blue bg-epi-blue/10 px-2.5 py-1 text-xs font-bold text-epi-blue"
        >
          Lycée · {data.origin.lycee.nom}
          <button
            type="button"
            onclick={() => navigateWithParams({ lycee: '' })}
            aria-label="Retirer le filtre lycée"
            class="cursor-pointer rounded-sm hover:bg-epi-blue/20"
          >
            <X class="h-3 w-3" />
          </button>
        </span>
      {/if}
      {#if data.origin.interest}
        <span
          class="inline-flex items-center gap-1.5 rounded-sm border border-epi-pink bg-epi-pink/10 px-2.5 py-1 text-xs font-bold text-epi-pink"
        >
          Intérêt · {data.origin.interest.emoji ?? ''}
          {data.origin.interest.nom}
          <button
            type="button"
            onclick={() => navigateWithParams({ interest: '' })}
            aria-label="Retirer le filtre intérêt"
            class="cursor-pointer rounded-sm hover:bg-epi-pink/20"
          >
            <X class="h-3 w-3" />
          </button>
        </span>
      {/if}
    </div>
  {/if}

  {#if data.rows.length === 0}
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

        <div class="w-52">
          <SearchableSelect
            options={lyceeOptions}
            value={lyceeFilter}
            onChange={(v) => (lyceeFilter = v)}
            allLabel="Tous les lycées"
            placeholder="Tous les lycées"
            searchPlaceholder="Rechercher un lycée…"
            emptyLabel="Aucun lycée."
            triggerClass="w-full"
          >
            {#snippet icon()}
              <School class="h-4 w-4 text-muted-foreground" />
            {/snippet}
          </SearchableSelect>
        </div>
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
        {#if clientFiltersApplied}
          <Button
            variant="ghost"
            size="sm"
            onclick={resetClientFilters}
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
          {#if r.ready}
            <span
              class="inline-flex items-center gap-1 rounded-full border border-epi-teal/30 bg-epi-teal/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-epi-teal-solid uppercase"
            >
              <Check class="h-3 w-3" />
              Prêt
            </span>
          {:else}
            <span
              class="inline-flex items-center gap-1 rounded-full border border-epi-orange/30 bg-epi-orange/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-epi-orange uppercase"
            >
              <CircleAlert class="h-3 w-3" />
              Incomplet
            </span>
          {/if}
        </Table.Cell>
      {/snippet}

      {#snippet empty()}
        <div class="flex flex-col items-center gap-3 py-6">
          <span
            class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            Aucun résultat
          </span>
          {#if clientFiltersApplied}
            <Button
              variant="outline"
              size="sm"
              onclick={resetClientFilters}
              class="rounded-sm"
            >
              Réinitialiser les filtres
            </Button>
          {/if}
        </div>
      {/snippet}
    </SortableTable>
  {/if}
</div>
