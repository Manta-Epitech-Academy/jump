<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  import { eventTypeLabel } from '$lib/domain/event';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Calendar from '@lucide/svelte/icons/calendar';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';

  let { data }: { data: PageData } = $props();

  // Track which groups are expanded (all open by default)
  let expanded = $state<Record<string, boolean>>(
    Object.fromEntries(data.groups.map((g) => [g.eventType, true])),
  );

  function formatDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function rate(submissions: number, participants: number): number {
    return participants > 0
      ? Math.round((submissions / participants) * 100)
      : 0;
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

  {#if data.groups.length > 0}
    <div class="space-y-6">
      {#each data.groups as group}
        {@const totalRate = rate(
          group.totalSubmissions,
          group.totalParticipants,
        )}
        <div class="overflow-hidden rounded-xl border bg-card">
          <!-- Group header -->
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-4 p-4 text-left transition-colors hover:bg-muted/50"
            onclick={() =>
              (expanded[group.eventType] = !expanded[group.eventType])}
          >
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-epi-pink/10"
            >
              <MessageSquare class="h-5 w-5 text-epi-pink" />
            </div>

            <div class="min-w-0 flex-1">
              <h2 class="text-sm font-bold text-foreground">
                {eventTypeLabel(group.eventType)}
              </h2>
              <p class="text-xs text-muted-foreground">
                {group.events.length} événement{group.events.length > 1
                  ? 's'
                  : ''}
              </p>
            </div>

            <div class="flex shrink-0 items-center gap-3">
              <div class="text-right">
                <div class="text-sm font-bold text-foreground">
                  {group.totalSubmissions} / {group.totalParticipants}
                </div>
                <div class="text-xs text-muted-foreground">
                  {totalRate}% de réponses
                </div>
              </div>
              <ChevronDown
                class="h-4 w-4 text-muted-foreground transition-transform {expanded[
                  group.eventType
                ]
                  ? 'rotate-180'
                  : ''}"
              />
            </div>
          </button>

          <!-- Event list -->
          {#if expanded[group.eventType]}
            <div class="border-t">
              {#each group.events as event, i}
                <a
                  href={resolve(`/staff/admin/events/${event.id}/feedback`)}
                  class="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50 {i >
                  0
                    ? 'border-t'
                    : ''}"
                >
                  <div class="w-10"></div>

                  <div class="min-w-0 flex-1">
                    <h3 class="truncate text-sm font-medium text-foreground">
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
                      <div class="text-sm font-medium text-foreground">
                        {event.submissions} / {event.participants}
                      </div>
                      <div class="text-xs text-muted-foreground">
                        {rate(event.submissions, event.participants)}%
                      </div>
                    </div>
                    <ArrowRight
                      class="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-epi-pink"
                    />
                  </div>
                </a>
              {/each}
            </div>
          {/if}
        </div>
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
