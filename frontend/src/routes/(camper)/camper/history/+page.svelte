<script lang="ts">
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';
  import { formatDateFr, flattenMissions } from '$lib/utils';
  import { History, Calendar, BookOpen, ArrowLeft } from 'lucide-svelte';

  let { data }: { data: PageData } = $props();

  let missions = $derived(flattenMissions(data.pastParticipations));
</script>

<svelte:head>
  <title>Missions précédentes</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-8 sm:py-12">
  <header class="mb-8" in:fly={{ y: -20, duration: 400, delay: 100 }}>
    <Button
      variant="ghost"
      href={resolve('/camper')}
      class="mb-4 gap-2 text-sm font-bold text-slate-500 hover:text-epi-blue"
    >
      <ArrowLeft class="h-4 w-4" />
      Retour au cockpit
    </Button>
    <h1
      class="flex items-center gap-3 font-heading text-3xl tracking-tight text-slate-900 uppercase dark:text-white"
    >
      <History class="h-7 w-7 text-epi-blue" />
      Missions précédentes<span class="text-epi-teal">_</span>
    </h1>
    <p class="mt-2 text-sm text-slate-500">Toutes tes missions complétées.</p>
  </header>

  {#if missions.length > 0}
    <div
      class="grid gap-4 sm:grid-cols-2"
      in:fly={{ y: 20, duration: 400, delay: 200 }}
    >
      {#each missions as mission}
        <div
          class="group flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-epi-blue/30 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
        >
          <div class="mb-4">
            <div
              class="mb-2 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase"
            >
              <Calendar class="h-3 w-3" />
              {formatDateFr(mission.eventDate)}
            </div>
            <h3 class="line-clamp-2 font-normal text-slate-900 dark:text-white">
              {mission.subject.nom}
            </h3>
          </div>
          <Button
            variant="outline"
            href={resolve(`/camper/${mission.subject.id}`)}
            class="w-full gap-2 rounded-xl border-slate-200 transition-colors group-hover:border-epi-blue group-hover:bg-epi-blue group-hover:text-white dark:border-slate-800 dark:group-hover:border-epi-blue dark:group-hover:bg-epi-blue dark:group-hover:text-white"
          >
            <BookOpen class="h-4 w-4" /> Revoir la mission
          </Button>
        </div>
      {/each}
    </div>
  {:else}
    <div
      class="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/50"
    >
      <History class="mb-4 h-8 w-8 text-slate-400" />
      <h3 class="text-lg font-bold text-slate-700 dark:text-slate-300">
        Aucune mission passée
      </h3>
      <p class="mt-2 max-w-sm text-sm text-slate-500">
        Tes missions complétées apparaîtront ici.
      </p>
    </div>
  {/if}
</div>
