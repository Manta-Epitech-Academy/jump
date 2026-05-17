<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Users from '@lucide/svelte/icons/users';
  import X from '@lucide/svelte/icons/x';
  import { Button } from '$lib/components/ui/button';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import EventSalesforceButton from '$lib/components/events/EventSalesforceButton.svelte';
  import InscritFilterBar from './components/InscritFilterBar.svelte';
  import InscritCardPrep from './components/InscritCardPrep.svelte';
  import InscritCardOngoing from './components/InscritCardOngoing.svelte';
  import InscritCardPast from './components/InscritCardPast.svelte';
  import PrepFilterChips from './components/PrepFilterChips.svelte';
  import { humanizeNiveau } from './components/niveau';
  import type {
    FilterKey,
    OngoingRow,
    PrepRow,
    Sort,
  } from './components/types';

  let { data }: { data: PageData } = $props();

  let searchQuery = $state('');
  let niveauFilter = $state<'all' | string>('all');
  let sort = $state<Sort>('alpha');

  function navigateWithParams(params: Record<string, string>) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    goto(url.toString(), { keepFocus: true, noScroll: true });
  }

  function changeFilter(next: FilterKey) {
    navigateWithParams({ filter: next === 'all' ? '' : next });
  }

  function clearLycee() {
    navigateWithParams({ lycee: '' });
  }
  function clearInterest() {
    navigateWithParams({ interest: '' });
  }

  function resetClientFilters() {
    searchQuery = '';
    niveauFilter = 'all';
    sort = 'alpha';
  }

  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function makeHaystack(row: PrepRow | OngoingRow): string {
    const t = row.participation.talent;
    const interests = (t?.interests ?? []).map((i) => i.interest.nom).join(' ');
    return norm(
      [
        t?.nom,
        t?.prenom,
        t?.email,
        t?.parentEmail,
        humanizeNiveau(t?.niveau),
        t?.highSchoolName,
        interests,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  function applySearch<T extends PrepRow | OngoingRow>(
    rows: T[],
    query: string,
  ): T[] {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return rows;
    return rows.filter((r) => {
      const h = makeHaystack(r);
      return tokens.every((tok) => h.includes(tok));
    });
  }

  function applyNiveau<T extends PrepRow | OngoingRow>(
    rows: T[],
    niveau: string,
  ): T[] {
    if (niveau === 'all') return rows;
    return rows.filter((r) => r.participation.talent?.niveau === niveau);
  }

  function applySort<T extends PrepRow | OngoingRow>(rows: T[], s: Sort): T[] {
    const out = [...rows];
    switch (s) {
      case 'alpha':
        out.sort((a, b) => {
          const an = `${a.participation.talent?.nom ?? ''} ${a.participation.talent?.prenom ?? ''}`;
          const bn = `${b.participation.talent?.nom ?? ''} ${b.participation.talent?.prenom ?? ''}`;
          return an.localeCompare(bn, 'fr');
        });
        break;
      case 'xp':
        out.sort(
          (a, b) =>
            (b.participation.talent?.xp ?? 0) -
            (a.participation.talent?.xp ?? 0),
        );
        break;
      case 'events':
        out.sort(
          (a, b) =>
            (b.participation.talent?.eventsCount ?? 0) -
            (a.participation.talent?.eventsCount ?? 0),
        );
        break;
    }
    return out;
  }

  const variant = $derived(data.variant);

  const totalCount = $derived(
    variant.kind === 'prep' ? variant.counts.all : variant.rows.length,
  );
  const presentCount = $derived(
    variant.kind === 'past' || variant.kind === 'ongoing'
      ? variant.rows.filter((r) => r.participation.isPresent).length
      : 0,
  );
  const absentCount = $derived(
    variant.kind === 'past' ? totalCount - presentCount : 0,
  );

  const clientFiltersApplied = $derived(
    searchQuery.trim().length > 0 || niveauFilter !== 'all',
  );
  const urlFilterApplied = $derived(
    variant.kind === 'prep' && variant.filter !== 'all',
  );
</script>

<svelte:head>
  <title>{data.event.titre} — Inscrits</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageBreadcrumb
    items={[
      {
        label: data.event.titre,
        href: resolve(`/staff/dev/events/${data.event.id}`),
      },
      { label: 'Inscrits' },
    ]}
  />
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
            onclick={clearLycee}
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
            onclick={clearInterest}
            aria-label="Retirer le filtre intérêt"
            class="cursor-pointer rounded-sm hover:bg-epi-pink/20"
          >
            <X class="h-3 w-3" />
          </button>
        </span>
      {/if}
    </div>
  {/if}

  {#if totalCount === 0}
    <div
      class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-16 text-center"
    >
      <Users class="h-10 w-10 text-muted-foreground opacity-30" />
      <h3
        class="mt-4 text-sm font-bold tracking-widest text-foreground uppercase"
      >
        Aucun talent inscrit
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
    <p class="text-sm text-muted-foreground">
      <span class="font-bold text-foreground">
        {totalCount}
        {totalCount > 1 ? 'talents' : 'talent'}
      </span>
      {#if variant.kind === 'past'}
        {totalCount > 1 ? 'étaient inscrits' : 'était inscrit'} —
        <span class="font-mono font-bold text-green-600 dark:text-green-400">
          {presentCount}
        </span>
        {presentCount > 1 ? 'présents' : 'présent'}{#if absentCount > 0}{','}
          <span class="font-mono font-bold text-destructive">
            {absentCount}
          </span>
          {absentCount > 1 ? 'absents' : 'absent'}{/if}.
      {:else}
        {totalCount > 1 ? 'sont attendus' : 'est attendu'}.
      {/if}
    </p>

    {#if variant.kind === 'prep'}
      <div class="space-y-3">
        <InscritFilterBar
          bind:searchQuery
          bind:niveauFilter
          bind:sort
          availableNiveaux={data.availableNiveaux}
        />
        <PrepFilterChips
          filter={variant.filter}
          counts={variant.counts}
          onFilterChange={changeFilter}
        />
      </div>

      {@const filtered = applySort(
        applyNiveau(applySearch(variant.rows, searchQuery), niveauFilter),
        sort,
      )}
      {#if filtered.length === 0}
        <div
          class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-12 text-center"
        >
          <h3
            class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            Aucun résultat
          </h3>
          {#if clientFiltersApplied || urlFilterApplied}
            <Button
              variant="outline"
              size="sm"
              onclick={() => {
                resetClientFilters();
                changeFilter('all');
              }}
              class="mt-3 rounded-sm"
            >
              Réinitialiser les filtres
            </Button>
          {/if}
        </div>
      {:else}
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {#each filtered as row (row.participation.id)}
            <InscritCardPrep {row} />
          {/each}
        </div>
      {/if}
    {:else if variant.kind === 'ongoing'}
      <InscritFilterBar
        bind:searchQuery
        bind:niveauFilter
        bind:sort
        availableNiveaux={data.availableNiveaux}
      />

      {@const filtered = applySort(
        applyNiveau(applySearch(variant.rows, searchQuery), niveauFilter),
        sort,
      )}
      {#if filtered.length === 0}
        <div
          class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-12 text-center"
        >
          <h3
            class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            Aucun résultat
          </h3>
          {#if clientFiltersApplied}
            <Button
              variant="outline"
              size="sm"
              onclick={resetClientFilters}
              class="mt-3 rounded-sm"
            >
              Réinitialiser les filtres
            </Button>
          {/if}
        </div>
      {:else}
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {#each filtered as row (row.participation.id)}
            <InscritCardOngoing {row} timezone={data.timezone} />
          {/each}
        </div>
      {/if}
    {:else}
      <InscritFilterBar
        bind:searchQuery
        bind:niveauFilter
        bind:sort
        availableNiveaux={data.availableNiveaux}
      />

      {@const filtered = applySort(
        applyNiveau(applySearch(variant.rows, searchQuery), niveauFilter),
        sort,
      )}
      {#if filtered.length === 0}
        <div
          class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-12 text-center"
        >
          <h3
            class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            Aucun résultat
          </h3>
          {#if clientFiltersApplied}
            <Button
              variant="outline"
              size="sm"
              onclick={resetClientFilters}
              class="mt-3 rounded-sm"
            >
              Réinitialiser les filtres
            </Button>
          {/if}
        </div>
      {:else}
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {#each filtered as row (row.participation.id)}
            <InscritCardPast {row} timezone={data.timezone} />
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>
