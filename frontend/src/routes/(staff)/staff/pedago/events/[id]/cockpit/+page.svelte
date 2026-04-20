<script lang="ts">
  import type { PageData } from './$types';
  import { ArrowLeft, ArrowRight, MonitorPlay, Clock } from '@lucide/svelte';
  import { resolve } from '$app/paths';

  let { data }: { data: PageData } = $props();

  function formatTime(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: data.timezone,
    });
  }
</script>

<div class="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
  <div class="border-b border-border bg-slate-950 pt-6 pb-6 text-white">
    <div class="container mx-auto max-w-3xl px-4">
      <a
        href={resolve(`/staff/pedago`)}
        class="flex items-center gap-1 text-xs font-black tracking-widest text-slate-400 uppercase transition-colors hover:text-epi-blue"
      >
        <ArrowLeft class="h-3 w-3" /> Retour au Dashboard
      </a>

      <h1
        class="mt-4 flex items-center gap-3 text-2xl font-bold tracking-tight uppercase"
      >
        <MonitorPlay class="h-6 w-6 text-epi-blue" />
        Sélecteur de Cockpit
      </h1>
      <p class="mt-2 text-sm font-medium text-slate-300">
        L'événement <strong class="text-epi-blue uppercase"
          >{data.event.titre}</strong
        > comporte plusieurs sessions. Quel créneau souhaitez-vous piloter ?
      </p>
    </div>
  </div>

  <div class="container mx-auto mt-8 max-w-3xl px-4">
    <div class="space-y-4">
      {#each data.orgaActivities as orga (orga.id)}
        <a
          href={resolve(
            `/staff/pedago/events/${data.event.id}/cockpit/${orga.id}`,
          )}
          class="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-md transition-all hover:-translate-y-1 hover:border-epi-blue dark:shadow-none dark:ring-1 dark:ring-border/50"
        >
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-epi-blue/10 dark:bg-epi-blue/20"
          >
            <MonitorPlay class="h-6 w-6 text-epi-blue dark:text-blue-400" />
          </div>
          <div class="flex-1">
            <span class="text-lg font-bold tracking-tight uppercase"
              >{orga.nom}</span
            >
            <div
              class="mt-1 flex items-center gap-2 text-sm font-medium text-muted-foreground"
            >
              <Clock class="h-4 w-4" />
              {formatTime(orga.startTime)} — {formatTime(orga.endTime)}
              {#if orga.slotLabel}
                <span
                  class="ml-2 rounded-sm bg-muted px-2 py-0.5 text-xs font-bold tracking-widest uppercase"
                  >{orga.slotLabel}</span
                >
              {/if}
            </div>
          </div>
          <ArrowRight class="h-5 w-5 text-muted-foreground" />
        </a>
      {/each}
    </div>
  </div>
</div>
