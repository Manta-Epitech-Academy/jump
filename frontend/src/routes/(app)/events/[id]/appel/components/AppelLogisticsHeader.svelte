<script lang="ts">
  import {
    ArrowLeft,
    Info,
    MonitorSmartphone,
    KeyRound,
    LifeBuoy,
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  let {
    event,
    presentCount,
    lateCount,
    helpCount,
    totalStudents,
    pcsNeeded,
  }: {
    event: any;
    presentCount: number;
    lateCount: number;
    helpCount: number;
    totalStudents: number;
    pcsNeeded: number;
  } = $props();
</script>

<div class="border-b border-border bg-background pt-4 pb-4">
  <div class="container mx-auto max-w-2xl px-4">
    <div class="mb-4 flex items-center justify-between">
      <a
        href={resolve(`/events/${event.id}/builder`)}
        class="flex items-center gap-1 text-xs font-black tracking-widest text-muted-foreground uppercase transition-colors hover:text-epi-blue"
      >
        <ArrowLeft class="h-3 w-3" /> Retour au builder
      </a>
      <div class="flex gap-2">
        <div
          class="rounded-sm bg-epi-teal px-2 py-0.5 text-[10px] font-black text-black uppercase"
        >
          {presentCount} Présents
        </div>
        {#if lateCount > 0}
          <div
            class="rounded-sm bg-orange-200 px-2 py-0.5 text-[10px] font-black text-orange-800 uppercase"
          >
            {lateCount} En retard
          </div>
        {/if}
        {#if helpCount > 0}
          <div
            class="flex animate-pulse items-center gap-1 rounded-sm bg-epi-orange px-2 py-0.5 text-[10px] font-black text-white uppercase"
          >
            <LifeBuoy class="h-3 w-3" />
            {helpCount} Appels
          </div>
        {/if}
      </div>
    </div>

    <h1 class="text-xl font-bold uppercase">
      Appel : <span style:view-transition-name="event-title-{event.id}"
        >{event.titre}</span
      >
    </h1>

    {#if event.notes}
      <div
        class="mt-4 rounded-sm border-l-4 border-l-epi-blue bg-blue-50/50 p-4 dark:bg-blue-900/10"
      >
        <div class="flex items-start gap-3">
          <Info class="mt-0.5 h-5 w-5 shrink-0 text-epi-blue" />
          <div class="space-y-1">
            <h4
              class="text-sm font-bold text-blue-900 uppercase dark:text-blue-100"
            >
              Note / Planning
            </h4>
            <p
              class="text-sm leading-relaxed whitespace-pre-wrap text-blue-800 dark:text-blue-200"
            >
              {event.notes}
            </p>
          </div>
        </div>
      </div>
    {/if}

    <div
      class="mt-4 grid gap-4 rounded-sm border border-border bg-slate-900 p-4 text-white shadow-md dark:bg-card {event.pin
        ? 'grid-cols-3'
        : 'grid-cols-2'}"
    >
      <div class="flex flex-col">
        <span
          class="text-[10px] font-black tracking-widest text-slate-400 uppercase"
          >Total Élèves</span
        >
        <span class="text-2xl font-bold">{totalStudents}</span>
      </div>
      <div
        class="flex items-center justify-between border-l border-slate-700 pl-4"
      >
        <div class="flex flex-col">
          <span
            class="text-[10px] font-black tracking-widest text-epi-orange uppercase"
            >PC à Préparer</span
          >
          <span class="text-3xl font-bold text-epi-orange">{pcsNeeded}</span>
        </div>
        <MonitorSmartphone class="h-8 w-8 text-slate-700" />
      </div>
      {#if event.pin}
        <div
          class="flex items-center justify-between border-l border-slate-700 pl-4"
        >
          <div class="flex flex-col">
            <span
              class="text-[10px] font-black tracking-widest text-amber-400 uppercase"
              >PIN Manta</span
            >
            <span
              class="font-mono text-3xl font-bold tracking-widest text-amber-400"
              >{event.pin}</span
            >
          </div>
          <KeyRound class="h-8 w-8 text-slate-700" />
        </div>
      {/if}
    </div>
  </div>
</div>
