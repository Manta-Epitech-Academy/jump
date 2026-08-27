<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import Clock from '@lucide/svelte/icons/clock';
  import * as Table from '$lib/components/ui/table';
  import { cn } from '$lib/utils';
  import { Button } from '$lib/components/ui/button';
  import { formatGivenName } from '$lib/domain/profile';
  import { cohortNounForms } from '$lib/domain/event';
  import { optionPolarity, type AnswerPolarity } from '$lib/domain/polarity';
  import SortableTable from '$lib/components/staff/datatable/SortableTable.svelte';
  import DataTableToolbar from '$lib/components/staff/datatable/DataTableToolbar.svelte';
  import FilterSelect from '$lib/components/staff/FilterSelect.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import { talentFicheHref } from '$lib/components/dev/talentFiche';
  import type {
    ColumnDef,
    SortDir,
  } from '$lib/components/staff/datatable/types';
  import type { BilanRow } from '../+page.server';
  import {
    buildHaystack,
    matchesAllTokens,
    searchTokens,
  } from '$lib/components/staff/datatable/search';
  import {
    nextSort,
    rowComparator,
  } from '$lib/components/staff/datatable/sort';

  let {
    rows,
    recoOptions,
    eventId,
    cohortNoun,
  }: {
    rows: BilanRow[];
    recoOptions: string[];
    eventId: string;
    cohortNoun: string | null;
  } = $props();

  // Event's Jump-owned cohort noun ("stagiaire" / "participant").
  const noun = $derived(cohortNounForms(cohortNoun));

  // Sentinel for the "no recommendation answer" filter bucket (kept distinct from
  // any real option label).
  const RECO_NONE = '__none';

  let searchQuery = $state('');
  let statut = $state<'all' | 'responded' | 'pending'>('all');
  let reco = $state<string>('all');
  let sortKey = $state<string>('nom');
  let sortDir = $state<SortDir>('asc');

  const columns: ColumnDef[] = [
    { key: 'avatar', label: '', class: 'w-10' },
    { key: 'prenom', label: 'Prénom', sortable: true, class: 'w-40' },
    { key: 'nom', label: 'Nom', sortable: true, class: 'w-full' },
    { key: 'reco', label: 'Recommandation', sortable: true, class: 'w-44' },
    { key: 'statut', label: 'Réponse', sortable: true, class: 'w-32' },
    { key: 'date', label: 'Date', sortable: true, class: 'w-32' },
  ];

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  function fmtDate(iso: string | null): string {
    return iso ? dateFmt.format(new Date(iso)) : '—';
  }

  // Sentiment tier from the option's position in the canonical best→worst list,
  // so the colour survives label edits and works for any future reco question.
  // The thresholds live in the domain, shared with the figure the curated API
  // computes from the same ordering: two places deciding what "good" means is two
  // places that drift.
  function recoTier(label: string | null): AnswerPolarity | null {
    if (!label) return null;
    const idx = recoOptions.indexOf(label);
    if (idx < 0) return null;
    return optionPolarity(idx, recoOptions.length);
  }

  const recoBadgeClass: Record<AnswerPolarity, string> = {
    positive: 'bg-success/10 text-success',
    neutral: 'bg-warning/10 text-warning',
    negative: 'bg-destructive/10 text-destructive',
  };

  function toggleSort(key: string) {
    const next = nextSort(columns, { key: sortKey, dir: sortDir }, key);
    sortKey = next.key;
    sortDir = next.dir;
  }

  // A talent who has not answered has no recommendation and no date. Those rows
  // sink in either direction (`rowComparator`), which is what this roster always
  // claimed in a comment and what its reco column did not do: the missing case
  // lived inside the asc/desc flip, so reversing the sort led with the
  // unanswered half of the cohort instead of burying it.
  function sortsLast(r: BilanRow, key: string): boolean {
    if (key === 'reco') return !r.recoLabel;
    if (key === 'date') return !r.respondedAt;
    return false;
  }

  function compareRows(a: BilanRow, b: BilanRow, key: string): number {
    // Reco sorts by best→worst rank, off the canonical option order.
    if (key === 'reco') {
      return (
        recoOptions.indexOf(a.recoLabel ?? '') -
        recoOptions.indexOf(b.recoLabel ?? '')
      );
    }
    // ISO instants compare lexicographically, i.e. chronologically.
    if (key === 'date') {
      return (a.respondedAt ?? '').localeCompare(b.respondedAt ?? '');
    }
    if (key === 'statut') {
      return Number(Boolean(a.respondedAt)) - Number(Boolean(b.respondedAt));
    }
    const av = (a[key as 'nom' | 'prenom'] as string) ?? '';
    const bv = (b[key as 'nom' | 'prenom'] as string) ?? '';
    return av.localeCompare(bv, 'fr');
  }

  const filtered = $derived.by(() => {
    const tokens = searchTokens(searchQuery);
    let out = rows.filter((r) => {
      if (statut === 'responded' && !r.respondedAt) return false;
      if (statut === 'pending' && r.respondedAt) return false;
      if (reco !== 'all') {
        if (reco === RECO_NONE) {
          if (r.recoLabel) return false;
        } else if (r.recoLabel !== reco) {
          return false;
        }
      }
      return matchesAllTokens(buildHaystack([r.prenom, r.nom]), tokens);
    });
    out = [...out].sort(
      rowComparator({
        compare: (a, b) => compareRows(a, b, sortKey),
        dir: sortDir,
        isMissing: (r) => sortsLast(r, sortKey),
      }),
    );
    return out;
  });

  const statutOptions = [
    { value: 'all', label: 'Tous' },
    { value: 'responded', label: 'A répondu' },
    { value: 'pending', label: 'En attente' },
  ];

  const recoFilterOptions = $derived([
    { value: 'all', label: 'Toutes' },
    ...recoOptions.map((l) => ({ value: l, label: l })),
    { value: RECO_NONE, label: 'Sans réponse' },
  ]);

  const anyFiltersApplied = $derived(
    searchQuery.trim() !== '' || statut !== 'all' || reco !== 'all',
  );

  function resetFilters() {
    searchQuery = '';
    statut = 'all';
    reco = 'all';
  }
</script>

<div class="space-y-4">
  <DataTableToolbar
    searchValue={searchQuery}
    onSearchInput={(v) => (searchQuery = v)}
    searchPlaceholder={`Rechercher un ${noun.singular}…`}
    searchWidthClass="w-full max-w-[230px]"
    filtersAlign="end"
    count={filtered.length}
    countNoun={noun.singular}
    countNounPlural={noun.plural}
    filtersApplied={anyFiltersApplied}
  >
    {#snippet filters()}
      <div class="flex items-center gap-2">
        <span class="hidden epi-overline text-muted-foreground sm:inline">
          Réponse
        </span>
        <FilterSelect
          ariaLabel="Filtrer par réponse"
          value={statut}
          options={statutOptions}
          onChange={(v) => (statut = v as typeof statut)}
        />
      </div>
      {#if recoOptions.length > 0}
        <div class="flex items-center gap-2">
          <span class="hidden epi-overline text-muted-foreground sm:inline">
            Recommandation
          </span>
          <FilterSelect
            ariaLabel="Filtrer par recommandation"
            value={reco}
            options={recoFilterOptions}
            onChange={(v) => (reco = v)}
          />
        </div>
      {/if}
    {/snippet}
  </DataTableToolbar>

  <SortableTable
    {columns}
    rows={filtered}
    {sortKey}
    {sortDir}
    onSort={toggleSort}
    rowKey={(r) => r.talentId}
    row={rowSnippet}
    mobileRow={mobileRowSnippet}
    empty={emptySnippet}
    stickyHeader
    layout="fixed"
  />
</div>

{#snippet statutBadge(r: BilanRow)}
  {#if r.respondedAt}
    <span
      class="inline-flex items-center gap-1 rounded-sm bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
    >
      <Check class="h-3 w-3" /> Répondu
    </span>
  {:else}
    <span
      class="inline-flex items-center gap-1 rounded-sm bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
    >
      <Clock class="h-3 w-3" /> En attente
    </span>
  {/if}
{/snippet}

{#snippet recoBadge(r: BilanRow)}
  {@const tier = recoTier(r.recoLabel)}
  {#if r.recoLabel && tier}
    <span
      class={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium',
        recoBadgeClass[tier],
      )}
    >
      {r.recoLabel}
    </span>
  {:else}
    <span class="text-xs text-muted-foreground">—</span>
  {/if}
{/snippet}

<!-- Only the avatar links to the fiche (new tab), the row and the name are inert.
     Marking a member's recommendation should never be a click away from a full
     navigation; mirrors the émargement roster. -->
{#snippet avatarLink(r: BilanRow)}
  <a
    href={talentFicheHref(r.talentId, eventId)}
    target="_blank"
    rel="noopener"
    class="inline-flex align-middle"
    title="Voir la fiche"
    aria-label={`Ouvrir la fiche de ${r.prenom ?? ''} ${r.nom ?? ''} (nouvel onglet)`}
  >
    <TalentAvatar
      talent={{ id: r.talentId, nom: r.nom, prenom: r.prenom }}
      size="sm"
    />
  </a>
{/snippet}

{#snippet rowSnippet(r: BilanRow)}
  <Table.Cell class="w-10">{@render avatarLink(r)}</Table.Cell>
  <Table.Cell class="font-medium">
    {@const prenom = formatGivenName(r.prenom)}
    <span class="block truncate" title={prenom}>{prenom || '—'}</span>
  </Table.Cell>
  <Table.Cell class="font-bold uppercase">
    <span class="block truncate" title={r.nom ?? ''}>{r.nom ?? '—'}</span>
  </Table.Cell>
  <Table.Cell>{@render recoBadge(r)}</Table.Cell>
  <Table.Cell>{@render statutBadge(r)}</Table.Cell>
  <Table.Cell class="text-sm text-muted-foreground">
    {fmtDate(r.respondedAt)}
  </Table.Cell>
{/snippet}

{#snippet mobileRowSnippet(r: BilanRow)}
  <div class={cn('flex items-center gap-3 p-3')}>
    {@render avatarLink(r)}
    <div class="min-w-0 flex-1 space-y-1">
      <p class="truncate text-sm">
        <span class="font-medium">{formatGivenName(r.prenom)}</span>
        <span class="font-bold uppercase">{r.nom ?? ''}</span>
      </p>
      <p class="text-xs text-muted-foreground">
        {fmtDate(r.respondedAt)}
      </p>
      {@render recoBadge(r)}
    </div>
    {@render statutBadge(r)}
  </div>
{/snippet}

{#snippet emptySnippet()}
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
