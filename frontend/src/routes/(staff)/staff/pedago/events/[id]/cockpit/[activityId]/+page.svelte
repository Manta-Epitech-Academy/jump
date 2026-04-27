<script lang="ts">
  import type { PageData } from './$types';
  import { untrack, onDestroy, onMount } from 'svelte';
  import {
    ArrowLeft,
    KeyRound,
    Search,
    SignalHigh,
    MonitorSmartphone,
    Maximize,
    Minimize,
    Info,
  } from '@lucide/svelte';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import { toast } from 'svelte-sonner';
  import { resolve } from '$app/paths';
  import { triggerConfetti } from '$lib/actions/confetti';
  import CockpitStudentCard from './components/CockpitStudentCard.svelte';

  let { data }: { data: PageData } = $props();

  let participations = $state(untrack(() => data.participations));
  let progressRecords = $state(untrack(() => data.progressData));

  $effect(() => {
    participations = data.participations;
    progressRecords = data.progressData;
  });

  let searchQuery = $state('');
  let filterStatus = $state<'all' | 'present' | 'late' | 'help'>('all');
  let filterNiveau = $state<string>('all');

  let studentProgressMap = $derived.by(() => {
    const map = new Map<string, any[]>();
    progressRecords.forEach((p) => {
      const key = p.talentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(p);
    });
    return map;
  });

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

  let uniqueNiveaux = $derived.by(() => {
    const niveaux = new Set<string>();
    participations.forEach((p) => {
      if (p.talent?.niveau) niveaux.add(p.talent.niveau);
    });
    return Array.from(niveaux).sort((a, b) => {
      const indexA = NIVEAU_ORDER.indexOf(a);
      const indexB = NIVEAU_ORDER.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });
  });

  let filteredParticipations = $derived(
    participations.filter((p) => {
      const search = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        p.talent?.nom?.toLowerCase().includes(search) ||
        p.talent?.prenom?.toLowerCase().includes(search);
      if (!matchesSearch) return false;

      let matchesStatus = filterStatus === 'all';
      if (filterStatus === 'present') matchesStatus = p.isPresent === true;
      if (filterStatus === 'late') matchesStatus = (p.delay || 0) > 0;
      if (filterStatus === 'help') {
        const prgs = studentProgressMap.get(p.talentId) || [];
        matchesStatus = prgs.some((prog) => prog.status === 'needs_help');
      }

      const matchesNiveau =
        filterNiveau === 'all' || p.talent?.niveau === filterNiveau;

      return matchesStatus && matchesNiveau;
    }),
  );

  let presentCount = $derived(participations.filter((p) => p.isPresent).length);
  let lateCount = $derived(
    participations.filter((p) => (p.delay || 0) > 0).length,
  );
  let helpCount = $derived(
    progressRecords.filter((p) => p.status === 'needs_help').length,
  );
  let pcsNeeded = $derived(
    participations.filter((p) => p.bringPc === false).length,
  );

  async function handleDiplomaDownload(participationId: string) {
    const toastId = toast.loading('Génération du diplôme...');
    try {
      const res = await fetch(
        `${resolve('/api/diploma')}?participationId=${participationId}`,
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la génération');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const disposition = res.headers.get('Content-Disposition');
      let filename = 'Diplome.pdf';
      if (disposition && disposition.indexOf('filename=') !== -1) {
        filename = disposition.split('filename=')[1].replace(/"/g, '');
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Diplôme téléchargé !', { id: toastId });
      triggerConfetti();
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Erreur inconnue';
      toast.error(`Erreur : ${message}`, { id: toastId });
    }
  }

  const optimisticToggle = (id: string, field: 'isPresent' | 'bringPc') => {
    return () => {
      const index = participations.findIndex((p) => p.id === id);
      if (index !== -1) {
        const p = participations[index];
        if (field === 'isPresent') {
          p.isPresent = !p.isPresent;
          if (!p.isPresent) p.delay = 0;
        }
        if (field === 'bringPc') p.bringPc = !p.bringPc;
      }
      return async ({
        result,
        update,
      }: {
        result: { type: string };
        update: () => Promise<void>;
      }) => {
        if (result.type === 'failure' || result.type === 'error') {
          const i = participations.findIndex((p) => p.id === id);
          if (i !== -1) {
            const p = participations[i];
            if (field === 'isPresent') p.isPresent = !p.isPresent;
            if (field === 'bringPc') p.bringPc = !p.bringPc;
          }
        }
        await update();
      };
    };
  };

  // --- Kiosk / Focus Mode ---
  let isFocusMode = $state(false);

  function enterFocusMode() {
    isFocusMode = true;
    document.documentElement.classList.add('focus-mode');
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function exitFocusMode() {
    isFocusMode = false;
    document.documentElement.classList.remove('focus-mode');
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function toggleFocusMode() {
    if (isFocusMode) exitFocusMode();
    else enterFocusMode();
  }

  function handleFullscreenChange() {
    // Sync state when user exits fullscreen via Esc
    if (!document.fullscreenElement && isFocusMode) exitFocusMode();
  }

  onMount(() => {
    // Safety: strip stale class that could persist from a prior session
    document.documentElement.classList.remove('focus-mode');
    document.addEventListener('fullscreenchange', handleFullscreenChange);
  });

  onDestroy(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('focus-mode');
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
  });
</script>

<div class="flex min-h-screen flex-col bg-background pb-20">
  <!-- Cockpit header (hidden in focus mode) -->
  <div
    class="focus-hide relative overflow-hidden bg-slate-950 pt-4 pb-6 text-white shadow-md"
  >
    <div class="absolute top-0 left-0 h-1 w-full bg-epi-blue"></div>
    <div class="absolute -top-10 -right-10 opacity-10">
      <SignalHigh class="h-48 w-48 text-epi-blue" />
    </div>

    <div class="relative z-10 container mx-auto max-w-4xl px-4">
      <div class="mb-4 flex items-center justify-between">
        <a
          href={resolve(`/staff/pedago/events/${data.event.id}/cockpit`)}
          class="flex items-center gap-1 text-xs font-black tracking-widest text-slate-400 uppercase transition-colors hover:text-epi-blue"
        >
          <ArrowLeft class="h-3 w-3" /> Retour
        </a>
        <Button
          variant="outline"
          size="sm"
          class="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          onclick={toggleFocusMode}
        >
          {#if isFocusMode}
            <Minimize class="mr-2 h-4 w-4" /> Quitter Focus
          {:else}
            <Maximize class="mr-2 h-4 w-4" /> Mode Focus
          {/if}
        </Button>
      </div>

      <div class="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div class="mb-1 flex items-center gap-3">
            <span class="relative flex h-2.5 w-2.5">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-epi-blue opacity-75"
              ></span>
              <span
                class="relative inline-flex h-2.5 w-2.5 rounded-full bg-epi-blue"
              ></span>
            </span>
            <span
              class="text-xs font-bold tracking-widest text-epi-blue uppercase"
              >Live Ops</span
            >
          </div>
          <h1 class="text-2xl font-bold uppercase">{data.event.titre}</h1>
        </div>

        <div class="flex gap-4">
          <div
            class="min-w-24 rounded-lg border border-slate-800 bg-slate-900 p-3 text-center"
          >
            <div class="text-2xl font-black text-white">
              {presentCount}<span class="text-sm text-slate-500"
                >/{participations.length}</span
              >
            </div>
            <div
              class="mt-1 text-[9px] font-bold tracking-widest text-slate-400 uppercase"
            >
              Présents
            </div>
          </div>

          <!-- KPI Retards -->
          <div
            class="min-w-24 rounded-lg border border-slate-800 bg-slate-900 p-3 text-center"
          >
            <div
              class="text-2xl font-black {lateCount > 0
                ? 'text-orange-400'
                : 'text-slate-500'}"
            >
              {lateCount}
            </div>
            <div
              class="mt-1 text-[9px] font-bold tracking-widest text-slate-400 uppercase"
            >
              Retards
            </div>
          </div>

          <!-- KPI Alertes -->
          <div
            class="relative min-w-24 rounded-lg border border-slate-800 bg-slate-900 p-3 text-center"
          >
            {#if helpCount > 0}
              <div
                class="absolute -top-2 -right-2 flex h-5 w-5 animate-bounce items-center justify-center rounded-full bg-epi-orange text-[10px] font-bold"
              >
                {helpCount}
              </div>
            {/if}
            <div
              class="text-2xl font-black {helpCount > 0
                ? 'text-epi-orange'
                : 'text-slate-500'}"
            >
              {helpCount}
            </div>
            <div
              class="mt-1 text-[9px] font-bold tracking-widest text-slate-400 uppercase"
            >
              Alertes Manta
            </div>
          </div>

          <!-- Code PIN -->
          {#if data.event.pin}
            <div
              class="min-w-24 rounded-lg border border-amber-900/50 bg-amber-950/30 p-3 text-center"
            >
              <div
                class="flex items-center justify-center gap-1 font-mono text-2xl font-black text-amber-400"
              >
                <KeyRound class="h-4 w-4" />
                {data.event.pin}
              </div>
              <div
                class="mt-1 text-[9px] font-bold tracking-widest text-amber-600 uppercase"
              >
                PIN Session
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  {#if data.event.notes}
    <div class="focus-hide container mx-auto mt-4 max-w-4xl px-4">
      <div
        class="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200"
      >
        <Info class="mt-0.5 h-4 w-4 shrink-0" />
        <p class="whitespace-pre-wrap">{data.event.notes}</p>
      </div>
    </div>
  {/if}

  <!-- BARRE DE RECHERCHE + FILTRES -->
  <div
    class="sticky top-0 z-20 border-b border-border bg-background/95 py-3 backdrop-blur-md"
  >
    <div
      class={cn(
        'container mx-auto flex flex-col gap-3 px-4',
        isFocusMode ? 'max-w-7xl' : 'max-w-4xl',
      )}
    >
      <div class="flex items-center gap-4">
        <div class="relative flex-1">
          <Search
            class="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground"
          />
          <Input
            placeholder="Rechercher un Talent dans la salle..."
            class={cn(
              'border-border bg-card pl-9',
              isFocusMode && 'h-12 text-base',
            )}
            bind:value={searchQuery}
          />
        </div>
        <div
          class="focus-hide hidden items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground sm:flex"
        >
          <MonitorSmartphone class="h-3 w-3" />
          {pcsNeeded} PC requis
        </div>
      </div>

      <div class="focus-hide flex flex-wrap items-center gap-2">
        {#each [{ id: 'all', label: 'Tous' }, { id: 'present', label: 'Présents' }, { id: 'late', label: 'Retards' }, { id: 'help', label: "Besoin d'aide" }] as opt}
          <button
            type="button"
            onclick={() => (filterStatus = opt.id as typeof filterStatus)}
            class={cn(
              'rounded-full border px-3 py-1 text-xs font-bold uppercase transition-colors',
              filterStatus === opt.id
                ? 'border-epi-blue bg-epi-blue text-white'
                : 'border-border bg-card text-muted-foreground hover:border-epi-blue/50 hover:text-epi-blue',
            )}
          >
            {opt.label}
          </button>
        {/each}

        {#if uniqueNiveaux.length > 0}
          <div class="ml-auto flex items-center gap-1">
            <span
              class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
            >
              Niveau :
            </span>
            <button
              type="button"
              onclick={() => (filterNiveau = 'all')}
              class={cn(
                'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase transition-colors',
                filterNiveau === 'all'
                  ? 'border-epi-blue bg-epi-blue text-white'
                  : 'border-border bg-card text-muted-foreground hover:border-epi-blue/50',
              )}
            >
              Tous
            </button>
            {#each uniqueNiveaux as n}
              <button
                type="button"
                onclick={() => (filterNiveau = n)}
                class={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase transition-colors',
                  filterNiveau === n
                    ? 'border-epi-blue bg-epi-blue text-white'
                    : 'border-border bg-card text-muted-foreground hover:border-epi-blue/50',
                )}
              >
                {n}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div
    class={cn(
      'container mx-auto mt-6 px-4',
      isFocusMode ? 'max-w-7xl' : 'max-w-4xl',
    )}
  >
    <div class={isFocusMode ? 'space-y-6' : 'space-y-4'}>
      {#each filteredParticipations as p, i (p.id)}
        <CockpitStudentCard
          participation={p}
          progress={studentProgressMap.get(p.talentId) || []}
          focusMode={isFocusMode}
          onDownload={handleDiplomaDownload}
          {optimisticToggle}
          index={i}
        />
      {:else}
        <div class="py-20 text-center">
          <p class="font-bold text-muted-foreground uppercase">
            Aucun Talent trouvé.
          </p>
        </div>
      {/each}
    </div>
  </div>

  <!-- Floating Exit Focus button (only in focus mode) -->
  {#if isFocusMode}
    <Button
      onclick={exitFocusMode}
      class="fixed top-4 right-4 z-50 h-11 gap-2 rounded-full bg-slate-900 text-white shadow-lg hover:bg-slate-800"
    >
      <Minimize class="h-4 w-4" /> Quitter Focus
    </Button>
  {/if}
</div>
