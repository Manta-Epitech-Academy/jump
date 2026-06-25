<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { Input } from '$lib/components/ui/input';
  import Search from '@lucide/svelte/icons/search';
  import Settings from '@lucide/svelte/icons/settings';
  import { eventTypeLabel } from '$lib/domain/event';
  import { EVENT_MODULE_DEFS } from '$lib/domain/eventModules';

  let { data }: { data: PageData } = $props();

  let query = $state('');
  const filtered = $derived(
    data.events.filter((e) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        e.titre.toLowerCase().includes(q) ||
        eventTypeLabel(e.eventType).toLowerCase().includes(q)
      );
    }),
  );

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  function dateLabel(date: string | Date, endDate: string | Date | null) {
    const start = dateFmt.format(new Date(date));
    return endDate ? `${start} au ${dateFmt.format(new Date(endDate))}` : start;
  }
</script>

<svelte:head>
  <title>Événements du campus</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageHeader
    title="Événements du campus"
    subtitle="Activez les modules d'un événement pour le faire apparaître dans le workspace. Le type Salesforce ne fait que proposer une configuration de départ."
  />

  <div class="relative max-w-sm">
    <Search
      class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
    />
    <Input
      bind:value={query}
      placeholder="Rechercher un événement..."
      class="rounded-sm pl-9"
    />
  </div>

  <div class="space-y-2">
    {#each filtered as e (e.id)}
      <a
        href={resolve(`/staff/dev/events/${e.id}`)}
        class="flex items-center justify-between gap-4 rounded-sm border border-border p-4 transition-colors hover:border-epi-blue hover:bg-muted/40"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="truncate font-bold">{e.titre}</span>
            {#if e.modules.length === 0}
              <span
                class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase"
              >
                Non configuré
              </span>
            {/if}
          </div>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {eventTypeLabel(e.eventType)} · {dateLabel(e.date, e.endDate)} · {e.participations}
            inscrit{e.participations > 1 ? 's' : ''}
          </p>
          {#if e.modules.length > 0}
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each e.modules as m (m)}
                <span
                  class="rounded-sm bg-epi-blue/10 px-1.5 py-0.5 text-[10px] font-bold text-epi-blue"
                >
                  {EVENT_MODULE_DEFS[m].label}
                </span>
              {/each}
            </div>
          {/if}
        </div>
        <span
          class="flex shrink-0 items-center gap-1.5 text-xs font-bold text-muted-foreground"
        >
          <Settings class="h-4 w-4" /> Configurer
        </span>
      </a>
    {:else}
      <p class="py-8 text-center text-sm text-muted-foreground">
        Aucun événement ne correspond.
      </p>
    {/each}
  </div>
</div>
