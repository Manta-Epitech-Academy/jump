<script lang="ts">
  import type { PageData } from './$types';
  import { ArrowLeft, ArrowRight, ClipboardCheck, Clock } from '@lucide/svelte';
  import { resolve } from '$app/paths';

  let { data }: { data: PageData } = $props();

  function formatTime(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  }
</script>

<div class="flex min-h-screen flex-col bg-background">
  <div class="border-b border-border bg-background pt-4 pb-4">
    <div class="container mx-auto max-w-2xl px-4">
      <a
        href={resolve(`/events/${data.event.id}/builder`)}
        class="flex items-center gap-1 text-xs font-black tracking-widest text-muted-foreground uppercase transition-colors hover:text-epi-blue"
      >
        <ArrowLeft class="h-3 w-3" /> Retour au builder
      </a>

      <h1 class="mt-4 text-xl font-bold uppercase">
        Appel : <span style:view-transition-name="event-title-{data.event.id}"
          >{data.event.titre}</span
        >
      </h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Plusieurs appels sont prévus pour cet événement. Choisissez le créneau.
      </p>
    </div>
  </div>

  <div class="container mx-auto mt-6 max-w-2xl px-4">
    <div class="space-y-3">
      {#each data.orgaActivities as orga (orga.id)}
        <a
          href={resolve(`/events/${data.event.id}/appel/${orga.id}`)}
          class="flex items-center gap-4 rounded-lg border bg-card p-4 transition-all hover:border-epi-teal hover:shadow-sm"
        >
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-epi-teal/10"
          >
            <ClipboardCheck class="h-5 w-5 text-epi-teal" />
          </div>
          <div class="flex-1">
            <span class="text-sm font-bold">{orga.nom}</span>
            <div
              class="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Clock class="h-3 w-3" />
              {formatTime(orga.startTime)} — {formatTime(orga.endTime)}
              {#if orga.slotLabel}
                <span>· {orga.slotLabel}</span>
              {/if}
            </div>
          </div>
          <ArrowRight class="h-4 w-4 text-muted-foreground" />
        </a>
      {/each}
    </div>
  </div>
</div>
