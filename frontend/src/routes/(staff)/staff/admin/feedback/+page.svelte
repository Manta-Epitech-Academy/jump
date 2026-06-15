<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Calendar from '@lucide/svelte/icons/calendar';

  let { data }: { data: PageData } = $props();

  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
</script>

<svelte:head>
  <title>Feedback</title>
</svelte:head>

<div class="mx-auto max-w-4xl">
  <div class="mb-6">
    <h1 class="text-2xl font-bold tracking-tight">Feedback</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      Retours des talents sur les événements.
    </p>
  </div>

  {#if data.events.length > 0}
    <div class="space-y-3">
      {#each data.events as event}
        {@const rate =
          event.participants > 0
            ? Math.round((event.submissions / event.participants) * 100)
            : 0}
        <a
          href={resolve(`/staff/admin/events/${event.id}/feedback`)}
          class="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-all hover:border-epi-pink/30 hover:shadow-md"
        >
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-epi-pink/10"
          >
            <MessageSquare class="h-5 w-5 text-epi-pink" />
          </div>

          <div class="min-w-0 flex-1">
            <h3 class="truncate text-sm font-semibold text-foreground">
              {event.titre}
            </h3>
            <div
              class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground"
            >
              <span class="flex items-center gap-1">
                <Calendar class="h-3 w-3" />
                {formatDate(event.date)}
              </span>
              <span>{event.campusName}</span>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-3">
            <div class="text-right">
              <div class="text-sm font-bold text-foreground">
                {event.submissions} / {event.participants}
              </div>
              <div class="text-xs text-muted-foreground">
                {rate}% de réponses
              </div>
            </div>
            <ArrowRight
              class="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-epi-pink"
            />
          </div>
        </a>
      {/each}
    </div>
  {:else}
    <div
      class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center"
    >
      <MessageSquare class="mb-4 h-8 w-8 text-muted-foreground" />
      <h3 class="text-lg font-bold text-foreground">
        Aucun feedback pour le moment
      </h3>
      <p class="mt-2 max-w-sm text-sm text-muted-foreground">
        Les retours des talents apparaîtront ici lorsqu'ils auront soumis leurs
        formulaires de feedback.
      </p>
    </div>
  {/if}
</div>
