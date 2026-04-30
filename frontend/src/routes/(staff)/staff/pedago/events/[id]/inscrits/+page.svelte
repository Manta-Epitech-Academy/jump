<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  import {
    Search,
    SignalLow,
    Trophy,
    Sparkles,
    ArrowUpDown,
    Baby,
  } from '@lucide/svelte';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import * as Avatar from '$lib/components/ui/avatar';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { cn } from '$lib/utils';

  let { data }: { data: PageData } = $props();

  type SortMode = 'name' | 'xp' | 'events';
  let search = $state('');
  let selectedNiveau = $state<string>('all');
  let selectedDifficulty = $state<string>('all');
  let sortMode = $state<SortMode>('name');

  const NIVEAU_ORDER = [
    '6eme',
    '5eme',
    '4eme',
    '3eme',
    '2nde',
    '1ere',
    'Terminale',
    'Sup',
  ];

  let allNiveaux = $derived.by(() => {
    const seen = new Set<string>();
    for (const p of data.participations) {
      if (p.talent.niveau) seen.add(p.talent.niveau);
    }
    return [...seen].sort((a, b) => {
      const i = NIVEAU_ORDER.indexOf(a);
      const j = NIVEAU_ORDER.indexOf(b);
      if (i !== -1 && j !== -1) return i - j;
      if (i !== -1) return -1;
      if (j !== -1) return 1;
      return a.localeCompare(b);
    });
  });

  const DIFFICULTIES = ['Débutant', 'Intermédiaire', 'Avancé'] as const;

  let filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    let list = data.participations.filter((p) => {
      if (q) {
        const haystack = `${p.talent.nom} ${p.talent.prenom}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (selectedNiveau !== 'all' && p.talent.niveau !== selectedNiveau)
        return false;
      if (
        selectedDifficulty !== 'all' &&
        p.talent.niveauDifficulte !== selectedDifficulty
      )
        return false;
      return true;
    });

    if (sortMode === 'xp') {
      list = [...list].sort((a, b) => (b.talent.xp ?? 0) - (a.talent.xp ?? 0));
    } else if (sortMode === 'events') {
      list = [...list].sort(
        (a, b) => (b.talent.eventsCount ?? 0) - (a.talent.eventsCount ?? 0),
      );
    }
    return list;
  });

  function getInitials(prenom: string, nom: string) {
    return ((nom?.[0] ?? '') + (prenom?.[0] ?? '')).toUpperCase();
  }

  function getDifficultyClass(diff: string | null) {
    switch (diff) {
      case 'Débutant':
        return 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-400';
      case 'Intermédiaire':
        return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-400';
      case 'Avancé':
        return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/40 dark:bg-purple-900/20 dark:text-purple-400';
      default:
        return 'border-border text-muted-foreground';
    }
  }

  let totalXp = $derived(
    data.participations.reduce((s, p) => s + (p.talent.xp ?? 0), 0),
  );
  let veteranCount = $derived(
    data.participations.filter((p) => (p.talent.eventsCount ?? 0) >= 2).length,
  );
  let newcomerCount = $derived(
    data.participations.filter((p) => (p.talent.eventsCount ?? 0) === 0).length,
  );
</script>

<div class="space-y-6 pb-12">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/pedago') },
      {
        label: data.event.titre,
        href: resolve(`/staff/pedago/events/${data.event.id}`),
      },
      { label: 'Inscrits' },
    ]}
  />

  <PageHeader
    title="Inscrits"
    subtitle={`${data.participations.length} talent${data.participations.length > 1 ? 's' : ''} — ${data.event.titre}`}
  />

  <!-- COHORT KPIs -->
  <div class="grid gap-3 sm:grid-cols-3">
    <div
      class="flex items-center gap-3 rounded-sm border bg-card p-4 shadow-sm"
    >
      <Trophy class="h-7 w-7 text-epi-orange" />
      <div>
        <div class="text-xl font-black">{totalXp}</div>
        <div
          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          XP total cohorte
        </div>
      </div>
    </div>
    <div
      class="flex items-center gap-3 rounded-sm border bg-card p-4 shadow-sm"
    >
      <Sparkles class="h-7 w-7 text-epi-teal-solid" />
      <div>
        <div class="text-xl font-black">{veteranCount}</div>
        <div
          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Vétérans (2+ événements)
        </div>
      </div>
    </div>
    <div
      class="flex items-center gap-3 rounded-sm border bg-card p-4 shadow-sm"
    >
      <Baby class="h-7 w-7 text-muted-foreground" />
      <div>
        <div class="text-xl font-black">{newcomerCount}</div>
        <div
          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          Première participation
        </div>
      </div>
    </div>
  </div>

  <!-- SEARCH + FILTERS -->
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <div class="relative flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          bind:value={search}
          placeholder="Rechercher un talent..."
          class="h-10 rounded-sm bg-card pl-10"
        />
      </div>
      <button
        type="button"
        onclick={() => {
          sortMode =
            sortMode === 'name' ? 'xp' : sortMode === 'xp' ? 'events' : 'name';
        }}
        class="flex h-10 items-center gap-2 rounded-sm border bg-card px-3 text-xs font-bold tracking-wider uppercase transition-colors hover:border-epi-blue/50 hover:text-epi-blue"
      >
        <ArrowUpDown class="h-3.5 w-3.5" />
        {sortMode === 'name'
          ? 'Nom'
          : sortMode === 'xp'
            ? 'XP'
            : 'Participations'}
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span
        class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
      >
        Niveau :
      </span>
      <button
        type="button"
        onclick={() => (selectedNiveau = 'all')}
        class={cn(
          'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase transition-colors',
          selectedNiveau === 'all'
            ? 'border-epi-blue bg-epi-blue text-white'
            : 'border-border bg-card text-muted-foreground hover:border-epi-blue/50',
        )}
      >
        Tous
      </button>
      {#each allNiveaux as n (n)}
        <button
          type="button"
          onclick={() => (selectedNiveau = n)}
          class={cn(
            'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase transition-colors',
            selectedNiveau === n
              ? 'border-epi-blue bg-epi-blue text-white'
              : 'border-border bg-card text-muted-foreground hover:border-epi-blue/50',
          )}
        >
          {n}
        </button>
      {/each}

      <span
        class="ml-auto text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
      >
        Aisance :
      </span>
      <button
        type="button"
        onclick={() => (selectedDifficulty = 'all')}
        class={cn(
          'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase transition-colors',
          selectedDifficulty === 'all'
            ? 'border-epi-blue bg-epi-blue text-white'
            : 'border-border bg-card text-muted-foreground hover:border-epi-blue/50',
        )}
      >
        Tous
      </button>
      {#each DIFFICULTIES as d (d)}
        <button
          type="button"
          onclick={() => (selectedDifficulty = d)}
          class={cn(
            'rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase transition-colors',
            selectedDifficulty === d
              ? 'border-epi-blue bg-epi-blue text-white'
              : 'border-border bg-card text-muted-foreground hover:border-epi-blue/50',
          )}
        >
          {d}
        </button>
      {/each}
    </div>
  </div>

  <!-- RESULT COUNT -->
  <div
    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
  >
    {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
  </div>

  <!-- LIST -->
  {#if filtered.length === 0}
    <div
      class="rounded-sm border border-dashed border-border bg-muted/10 py-12 text-center text-sm text-muted-foreground"
    >
      Aucun talent ne correspond aux filtres.
    </div>
  {:else}
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each filtered as p (p.id)}
        <a
          href={resolve(`/staff/pedago/students/${p.talent.id}`)}
          class="group flex items-start gap-3 rounded-sm border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-epi-blue hover:shadow-md"
        >
          <span
            class="block rounded-full"
            style:view-transition-name={`student-avatar-${p.talent.id}`}
          >
            <Avatar.Root class="h-12 w-12 border-2 border-muted">
              <Avatar.Fallback class="bg-muted text-xs font-bold">
                {getInitials(p.talent.prenom, p.talent.nom)}
              </Avatar.Fallback>
            </Avatar.Root>
          </span>

          <div class="min-w-0 flex-1 space-y-1.5">
            <div
              class="truncate text-sm font-bold tracking-tight uppercase group-hover:text-epi-blue"
            >
              {p.talent.nom} <span class="capitalize">{p.talent.prenom}</span>
            </div>
            <div class="flex flex-wrap items-center gap-1.5">
              {#if p.talent.niveau}
                <Badge
                  variant="outline"
                  class="px-1.5 py-0 text-[9px] tracking-widest uppercase"
                >
                  {p.talent.niveau}
                </Badge>
              {/if}
              {#if p.talent.niveauDifficulte}
                <Badge
                  variant="outline"
                  class={cn(
                    'gap-1 px-1.5 py-0 text-[9px] uppercase',
                    getDifficultyClass(p.talent.niveauDifficulte),
                  )}
                >
                  <SignalLow class="h-2.5 w-2.5" />
                  {p.talent.niveauDifficulte}
                </Badge>
              {/if}
            </div>
            <div
              class="flex items-center gap-3 text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
            >
              <span class="flex items-center gap-1 text-epi-orange">
                <Trophy class="h-3 w-3" />
                {p.talent.xp ?? 0} XP
              </span>
              <span class="opacity-30">·</span>
              <span>
                {p.talent.eventsCount ?? 0} événement{(p.talent.eventsCount ??
                  0) > 1
                  ? 's'
                  : ''}
              </span>
              {#if (p.talent.eventsCount ?? 0) === 0}
                <Badge
                  variant="secondary"
                  class="ml-auto px-1.5 py-0 text-[9px] tracking-widest uppercase"
                >
                  Nouveau
                </Badge>
              {/if}
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
