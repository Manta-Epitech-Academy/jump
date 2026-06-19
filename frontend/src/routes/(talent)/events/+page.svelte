<script lang="ts">
  import type { PageData } from './$types';
  import { fly } from 'svelte/transition';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import CalendarCheck from '@lucide/svelte/icons/calendar-check';
  import Calendar from '@lucide/svelte/icons/calendar';

  let { data }: { data: PageData } = $props();

  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
</script>

<svelte:head>
  <title>Mes événements</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
  <TalentPageHeader title="Mes événements" icon={CalendarCheck} />

  <div class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
    {#if data.pastEvents.length > 0}
      <div class="space-y-3" in:fly={{ y: 20, duration: 400, delay: 200 }}>
        {#each data.pastEvents as p (p.id)}
          <div
            class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-epi-blue/10 dark:bg-epi-blue/20"
            >
              <Calendar class="h-5 w-5 text-epi-blue" />
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
                {p.event.titre}
              </h3>
              <p class="mt-0.5 text-xs text-slate-400 capitalize">
                {formatDate(p.event.date)}
              </p>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div
        class="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/50"
      >
        <CalendarCheck class="mb-4 h-8 w-8 text-slate-400" />
        <h3 class="text-lg font-bold text-slate-700 dark:text-slate-300">
          Aucun événement passé
        </h3>
        <p class="mt-2 max-w-sm text-sm text-slate-500">
          Tes participations aux Coding Club apparaîtront ici.
        </p>
      </div>
    {/if}
  </div>

  <TalentFooter />
</div>
