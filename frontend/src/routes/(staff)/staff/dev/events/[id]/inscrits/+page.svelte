<script lang="ts">
  import { resolve } from '$app/paths';
  import { Users } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import InscritFilterBar from './components/InscritFilterBar.svelte';
  import InscritCard from './components/InscritCard.svelte';
  import { humanizeNiveau } from './components/niveau';
  import type { Sort } from './components/types';

  let { data }: { data: PageData } = $props();

  let searchQuery = $state('');
  let niveauFilter = $state<'all' | string>('all');
  let sort = $state<Sort>('alpha');

  let deleteDialogOpen = $state(false);
  let participationToDelete = $state<string | null>(null);

  function confirmDelete(id: string) {
    participationToDelete = id;
    deleteDialogOpen = true;
  }

  function resetFilters() {
    searchQuery = '';
    niveauFilter = 'all';
    sort = 'alpha';
  }

  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  let filteredSorted = $derived.by(() => {
    let rows = data.rows;

    if (niveauFilter !== 'all') {
      rows = rows.filter(
        (r) => r.participation.talent?.niveau === niveauFilter,
      );
    }

    const tokens = norm(searchQuery).split(/\s+/).filter(Boolean);
    if (tokens.length > 0) {
      rows = rows.filter((r) => {
        const t = r.participation.talent;
        const haystack = norm(
          [
            t?.nom,
            t?.prenom,
            t?.email,
            t?.parentEmail,
            humanizeNiveau(t?.niveau),
            r.lastEvent?.titre,
          ]
            .filter(Boolean)
            .join(' '),
        );
        return tokens.every((tok) => haystack.includes(tok));
      });
    }

    const sorted = [...rows];
    switch (sort) {
      case 'alpha':
        sorted.sort((a, b) => {
          const an = `${a.participation.talent?.nom ?? ''} ${a.participation.talent?.prenom ?? ''}`;
          const bn = `${b.participation.talent?.nom ?? ''} ${b.participation.talent?.prenom ?? ''}`;
          return an.localeCompare(bn, 'fr');
        });
        break;
      case 'xp':
        sorted.sort(
          (a, b) =>
            (b.participation.talent?.xp ?? 0) -
            (a.participation.talent?.xp ?? 0),
        );
        break;
      case 'events':
        sorted.sort(
          (a, b) =>
            (b.participation.talent?.eventsCount ?? 0) -
            (a.participation.talent?.eventsCount ?? 0),
        );
        break;
      case 'lastEvent':
        sorted.sort((a, b) => {
          const ad = a.lastEvent?.date.getTime() ?? 0;
          const bd = b.lastEvent?.date.getTime() ?? 0;
          return bd - ad;
        });
        break;
    }
    return sorted;
  });

  let totalCount = $derived(data.rows.length);
  let hasFiltersApplied = $derived(
    searchQuery.trim().length > 0 || niveauFilter !== 'all',
  );

  let isPastEvent = $derived(new Date(data.event.date).getTime() < Date.now());
  let toProvideCount = $derived(
    data.rows.filter((r) => !r.participation.bringPc).length,
  );
  let presentCount = $derived(
    data.rows.filter((r) => r.participation.isPresent).length,
  );
  let absentCount = $derived(totalCount - presentCount);
</script>

<svelte:head>
  <title>{data.event.titre} — Inscrits</title>
</svelte:head>

<div class="flex h-full flex-col space-y-6 pb-10">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/dev') },
      {
        label: data.event.titre,
        href: resolve(`/staff/dev/events/${data.event.id}`),
      },
      { label: 'Inscrits' },
    ]}
  />
  <PageHeader title="Inscrits" />

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
      {#if isPastEvent}
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
        {totalCount > 1
          ? 'sont attendus'
          : 'est attendu'}{#if toProvideCount > 0}
          &nbsp;—&nbsp;
          <span
            class="font-mono font-bold text-purple-600 dark:text-purple-400"
          >
            {toProvideCount}
          </span>
          PC à préparer{/if}.
      {/if}
    </p>

    <InscritFilterBar
      bind:searchQuery
      bind:niveauFilter
      bind:sort
      availableNiveaux={data.availableNiveaux}
    />

    {#if filteredSorted.length === 0}
      <div
        class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 p-12 text-center"
      >
        <h3
          class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          Aucun résultat
        </h3>
        {#if hasFiltersApplied}
          <Button
            variant="outline"
            size="sm"
            onclick={resetFilters}
            class="mt-3 rounded-sm"
          >
            Réinitialiser les filtres
          </Button>
        {/if}
      </div>
    {:else}
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {#each filteredSorted as row (row.participation.id)}
          <InscritCard
            participation={row.participation}
            lastEvent={row.lastEvent}
            timezone={data.timezone}
            showPcTodo={!isPastEvent && !row.participation.bringPc}
            onDelete={confirmDelete}
          />
        {/each}
      </div>
    {/if}
  {/if}
</div>

<ConfirmDeleteDialog
  bind:open={deleteDialogOpen}
  action="?/remove&id={participationToDelete}"
  title="Retirer le Talent ?"
  description="Voulez-vous retirer ce Talent de l'événement ?"
  buttonText="Retirer"
/>
