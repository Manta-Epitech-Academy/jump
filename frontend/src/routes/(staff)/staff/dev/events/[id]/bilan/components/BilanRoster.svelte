<script lang="ts">
  import { page } from '$app/state';
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
  import ActiveFilterChips, {
    type ActiveFilterChip,
  } from '$lib/components/staff/ActiveFilterChips.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import { talentFicheHref } from '$lib/components/dev/talentFiche';
  import type { ColumnDef } from '$lib/components/staff/datatable/types';
  import { setListParams } from '$lib/components/staff/datatable/urlList';
  import { createUrlSearch } from '$lib/components/staff/datatable/urlSearch.svelte';
  import {
    BILAN_SORT_DEFAULT_DIR,
    type BilanFacet,
    type BilanSortKey,
    BILAN_VIEW,
  } from '$lib/domain/bilanView';
  import {
    bilanFacets,
    matchesBilanFacets,
    type BilanFacetState,
    type BilanRow,
    type RecoOption,
  } from '$lib/domain/bilanRoster';
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
    recoOptions: RecoOption[];
    eventId: string;
    cohortNoun: string | null;
  } = $props();

  // Event's Jump-owned cohort noun ("stagiaire" / "participant").
  const noun = $derived(cohortNounForms(cohortNoun));

  // Filters, sort and search live in the address (`$lib/domain/bilanView`), so
  // the event home's recommendation card can open this list already filtered.
  const view = $derived(BILAN_VIEW.parse(page.url.searchParams));
  const search = createUrlSearch();

  // Best→worst rank and label of each option, by id.
  const recoRank = $derived(new Map(recoOptions.map((o, i) => [o.id, i])));
  const recoLabel = $derived(
    new Map(recoOptions.map((o) => [o.id, o.label] as const)),
  );

  const facets = $derived(bilanFacets(rows, recoOptions, view));
  const facetOf = $derived(
    new Map<BilanFacet, BilanFacetState>(facets.map((f) => [f.facet, f])),
  );

  function setFacet(facet: BilanFacet, values: string[]) {
    setListParams(BILAN_VIEW.facetParams(facet, values));
  }

  // The header filter of a facet, or none when it has a single value to offer.
  function filterOf(facet: BilanFacet): ColumnDef['filter'] {
    const f = facetOf.get(facet);
    return f && f.options.length > 0
      ? {
          options: f.options,
          selected: f.selected,
          onChange: (values) => setFacet(facet, values),
        }
      : undefined;
  }

  // One control per column, as on Inscrits: the names and the date sort, the
  // recommendation and the response filter from their header.
  const columns = $derived.by<ColumnDef[]>(() => {
    const sortable = (key: BilanSortKey) => ({
      key,
      sortable: true,
      defaultSortDir: BILAN_SORT_DEFAULT_DIR[key],
    });
    return [
      { key: 'avatar', label: '', class: 'w-10' },
      { ...sortable('prenom'), label: 'Prénom', class: 'w-40' },
      { ...sortable('nom'), label: 'Nom', class: 'w-full' },
      {
        key: 'reco',
        label: 'Recommandation',
        class: 'w-48',
        filter: filterOf('reco'),
      },
      {
        key: 'reponse',
        label: 'Réponse',
        class: 'w-36',
        filter: filterOf('reponse'),
      },
      { ...sortable('date'), label: 'Date', class: 'w-32' },
    ];
  });

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  function fmtDate(iso: string | null): string {
    return iso ? dateFmt.format(new Date(iso)) : '-';
  }

  // Sentiment tier from the option's position in the canonical best→worst list,
  // so the colour survives label edits and works for any future reco question.
  // The thresholds live in the domain, shared with the figure the curated API
  // computes from the same ordering: two places deciding what "good" means is two
  // places that drift.
  function recoTier(optionId: string | null): AnswerPolarity | null {
    const idx = optionId ? recoRank.get(optionId) : undefined;
    if (idx === undefined) return null;
    return optionPolarity(idx, recoOptions.length);
  }

  const recoBadgeClass: Record<AnswerPolarity, string> = {
    positive: 'bg-success/10 text-success',
    neutral: 'bg-warning/10 text-warning',
    negative: 'bg-destructive/10 text-destructive',
  };

  function toggleSort(key: string) {
    const next = nextSort<BilanSortKey>(
      columns,
      { key: view.sort, dir: view.dir },
      key,
    );
    setListParams(BILAN_VIEW.sortParams(next.key, next.dir));
  }

  // A talent who has not answered has no date. Those rows sink in either
  // direction (`rowComparator`), so a reversed sort buries the unanswered half
  // of the cohort instead of leading with it.
  function compareRows(a: BilanRow, b: BilanRow, key: BilanSortKey): number {
    // ISO instants compare lexicographically, i.e. chronologically.
    if (key === 'date') {
      return (a.respondedAt ?? '').localeCompare(b.respondedAt ?? '');
    }
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    return av.localeCompare(bv, 'fr');
  }

  const filtered = $derived.by(() => {
    const tokens = searchTokens(search.value);
    let out = rows.filter(
      (r) =>
        matchesBilanFacets(r, facets) &&
        matchesAllTokens(buildHaystack([r.prenom, r.nom]), tokens),
    );
    out = [...out].sort(
      rowComparator({
        compare: (a, b) => compareRows(a, b, view.sort),
        dir: view.dir,
        isMissing: (r) => view.sort === 'date' && !r.respondedAt,
      }),
    );
    return out;
  });

  const chips = $derived<ActiveFilterChip[]>(
    facets.flatMap((f) =>
      f.selected.map((value) => ({
        id: `${f.facet}:${value}`,
        facet: f.title,
        label: f.options.find((o) => o.value === value)?.label ?? value,
        onRemove: () =>
          setFacet(
            f.facet,
            f.selected.filter((v) => v !== value),
          ),
      })),
    ),
  );

  const anyFiltersApplied = $derived(
    chips.length > 0 || search.value.trim() !== '',
  );

  // Clears the filters and the search, keeps the sort, as on Inscrits.
  function resetFilters() {
    search.clear();
    setListParams({ ...BILAN_VIEW.clearedFacetParams(), q: '' });
  }
</script>

<div class="space-y-4">
  <DataTableToolbar
    searchValue={search.value}
    onSearchInput={(v) => (search.value = v)}
    searchPlaceholder={`Rechercher un ${noun.singular}…`}
    searchWidthClass="w-full max-w-[230px]"
    count={filtered.length}
    countNoun={noun.singular}
    countNounPlural={noun.plural}
    filtersApplied={anyFiltersApplied}
  />

  <ActiveFilterChips {chips} onReset={resetFilters} />

  <SortableTable
    {columns}
    rows={filtered}
    sortKey={view.sort}
    sortDir={view.dir}
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
  {@const tier = recoTier(r.recoOptionId)}
  {@const label = r.recoOptionId ? recoLabel.get(r.recoOptionId) : undefined}
  {#if label && tier}
    <span
      class={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium',
        recoBadgeClass[tier],
      )}
    >
      {label}
    </span>
  {:else}
    <span class="text-xs text-muted-foreground">-</span>
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
    <span class="block truncate" title={prenom}>{prenom || '-'}</span>
  </Table.Cell>
  <Table.Cell class="font-bold uppercase">
    <span class="block truncate" title={r.nom ?? ''}>{r.nom ?? '-'}</span>
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
