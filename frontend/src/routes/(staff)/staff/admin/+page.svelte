<script lang="ts">
  import Map from '@lucide/svelte/icons/map';
  import Users from '@lucide/svelte/icons/users';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import EventStateBadge from '$lib/components/events/EventStateBadge.svelte';
  import EventModulesCell from '$lib/components/events/EventModulesCell.svelte';
  import { resolve } from '$app/paths';

  let { data } = $props();

  const eventsHref = resolve('/staff/admin/events');

  const syncTypeLabels = {
    campus_list: 'Liste des campus',
    events: 'Événements',
    talents: 'Talents',
    ref_comp: 'Référentiel de compétences',
    subject_import: 'Import de sujet',
  } as const;

  function formatSyncDateTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<svelte:head>
  <title>Tableau de bord</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="font-heading text-3xl tracking-wide uppercase">
      Système <span class="text-epi-pink">Global</span>
    </h1>
    <p class="text-sm font-bold text-muted-foreground uppercase">
      Vue d'ensemble du réseau Jump
    </p>
  </div>

  <!-- KPIs -->
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <a
      href={resolve('/staff/admin/campuses')}
      class="block transition-all hover:-translate-y-1"
    >
      <Card.Root
        class="h-full border-t-4 border-t-epi-pink shadow-sm hover:border-epi-pink/80"
      >
        <Card.Header
          class="flex flex-row items-center justify-between space-y-0 pb-2"
        >
          <Card.Title
            class="text-sm font-bold uppercase transition-colors hover:text-epi-pink"
            >Réseau</Card.Title
          >
          <Map class="h-4 w-4 text-muted-foreground" />
        </Card.Header>
        <Card.Content>
          <div class="text-2xl font-black">{data.stats.campuses}</div>
          <p class="text-xs text-muted-foreground">Campus actifs</p>
        </Card.Content>
      </Card.Root>
    </a>

    <a
      href={resolve('/staff/admin/users')}
      class="block transition-all hover:-translate-y-1"
    >
      <Card.Root
        class="h-full border-t-4 border-t-epi-pink shadow-sm hover:border-epi-pink/80"
      >
        <Card.Header
          class="flex flex-row items-center justify-between space-y-0 pb-2"
        >
          <Card.Title
            class="text-sm font-bold uppercase transition-colors hover:text-epi-pink"
            >Staff</Card.Title
          >
          <Users class="h-4 w-4 text-muted-foreground" />
        </Card.Header>
        <Card.Content>
          <div class="text-2xl font-black">{data.stats.users}</div>
          <p class="text-xs text-muted-foreground">Membres de l'équipe</p>
        </Card.Content>
      </Card.Root>
    </a>

    <a
      href={resolve('/staff/admin/talents')}
      class="block transition-all hover:-translate-y-1"
    >
      <Card.Root
        class="h-full border-t-4 border-t-epi-pink shadow-sm hover:border-epi-pink/80"
      >
        <Card.Header
          class="flex flex-row items-center justify-between space-y-0 pb-2"
        >
          <Card.Title
            class="text-sm font-bold uppercase transition-colors hover:text-epi-pink"
            >Talents</Card.Title
          >
          <GraduationCap class="h-4 w-4 text-muted-foreground" />
        </Card.Header>
        <Card.Content>
          <div class="text-2xl font-black">{data.stats.students}</div>
          <p class="text-xs text-muted-foreground">Inscrits en base</p>
        </Card.Content>
      </Card.Root>
    </a>

    <a href={eventsHref} class="block transition-all hover:-translate-y-1">
      <Card.Root
        class="h-full border-t-4 border-t-epi-pink shadow-sm hover:border-epi-pink/80"
      >
        <Card.Header
          class="flex flex-row items-center justify-between space-y-0 pb-2"
        >
          <Card.Title
            class="text-sm font-bold uppercase transition-colors hover:text-epi-pink"
            >Événements</Card.Title
          >
          <CalendarDays class="h-4 w-4 text-muted-foreground" />
        </Card.Header>
        <Card.Content>
          <div class="text-2xl font-black">{data.stats.events}</div>
          {#if data.stats.toPrepare > 0}
            <p class="text-xs font-medium text-amber-600">
              {data.stats.toPrepare} à préparer
            </p>
          {:else}
            <p class="text-xs text-muted-foreground">Organisés au total</p>
          {/if}
        </Card.Content>
      </Card.Root>
    </a>
  </div>

  <!-- Worker Sync Status -->
  <Card.Root>
    <Card.Header
      class="flex flex-row items-center justify-between space-y-0 pb-2"
    >
      <Card.Title class="text-sm font-bold uppercase"
        >Dernière synchro worker</Card.Title
      >
      <RefreshCw class="h-4 w-4 text-muted-foreground" />
    </Card.Header>
    <Card.Content>
      {#if data.lastSync}
        <div class="text-2xl font-black">
          {formatSyncDateTime(data.lastSync.at)}
        </div>
        <p class="text-xs text-muted-foreground">
          {syncTypeLabels[data.lastSync.type]}
          {#if data.lastSync.campusExtName}
            · {data.lastSync.campusExtName}
          {/if}
          {#if data.lastSync.eventExtId}
            · event {data.lastSync.eventExtId}
          {/if}
          {#if data.lastSync.created != null || data.lastSync.updated != null}
            · {data.lastSync.created ?? 0} créé(s),
            {data.lastSync.updated ?? 0} mis à jour
            {#if data.lastSync.removed != null}, {data.lastSync.removed} retiré(s){/if}
            {#if data.lastSync.skipped != null}, {data.lastSync.skipped} ignoré(s){/if}
          {/if}
        </p>
      {:else}
        <div class="text-2xl font-black text-muted-foreground">—</div>
        <p class="text-xs text-muted-foreground">
          Aucune synchro depuis le dernier redémarrage
        </p>
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Latest Events -->
  <Card.Root>
    <Card.Header
      class="flex flex-row items-center justify-between gap-2 space-y-0"
    >
      <Card.Title class="uppercase">Derniers événements créés</Card.Title>
      <a
        href={eventsHref}
        class="flex shrink-0 items-center gap-1 text-xs font-bold text-muted-foreground uppercase transition-colors hover:text-epi-pink"
      >
        Tous les événements
        <ArrowRight class="size-3.5" />
      </a>
    </Card.Header>
    <Card.Content>
      {#if data.recentEvents.length}
        <div class="space-y-2">
          {#each data.recentEvents as event (event.id)}
            <a
              href="{eventsHref}?event={event.id}"
              class="group flex items-center gap-4 rounded-sm border px-4 py-3 transition-colors hover:border-epi-pink/60 hover:bg-muted/40"
            >
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="truncate font-bold" title={event.displayName}>
                    {event.displayName}
                  </span>
                  {#if !event.synced}
                    <Badge
                      variant="outline"
                      class="shrink-0 text-[10px] font-normal text-muted-foreground"
                    >
                      Manuel
                    </Badge>
                  {/if}
                  <EventStateBadge
                    state={event.configState}
                    past={event.status === 'past'}
                  />
                </div>
                <p class="truncate text-xs text-muted-foreground">
                  {event.campusName} · {event.eventTypeLabel} · {event.dateLabel}
                </p>
              </div>
              <div class="hidden shrink-0 sm:block">
                <EventModulesCell modules={event.modules} />
              </div>
              <div class="shrink-0 text-right">
                <div class="text-sm font-bold tabular-nums">
                  {event.participations}
                </div>
                <div class="text-[10px] text-muted-foreground uppercase">
                  inscrits
                </div>
              </div>
              <ChevronRight
                class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-epi-pink"
              />
            </a>
          {/each}
        </div>
      {:else}
        <p class="py-6 text-center text-sm text-muted-foreground">
          Aucun événement.
        </p>
      {/if}
    </Card.Content>
  </Card.Root>
</div>
