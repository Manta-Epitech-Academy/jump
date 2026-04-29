<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import { EVENT_TYPES } from '$lib/domain/event';
  import type { FlagKey } from '$lib/domain/featureFlags';
  import {
    CalendarDays,
    MonitorPlay,
    Users,
    ShieldHalf,
    Award,
    ArchiveRestore,
    Activity,
    LifeBuoy,
    RadioTower,
    UserPlus,
    CalendarClock,
    BookOpenText,
    FileText,
    Zap,
    ArrowRight,
    Ellipsis,
    TriangleAlert,
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import TaskQueueItem from '$lib/components/staff/TaskQueueItem.svelte';
  import AssignMantasDialog from '$lib/components/events/AssignMantasDialog.svelte';

  let { data } = $props();

  let featureFlags = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]),
  );

  function formatDate(date: Date): string {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: data.timezone,
    });
  }

  let stageCountdownLabel = $derived(
    data.activeStage?.status === 'upcoming'
      ? `Démarre dans ${data.activeStage.startsInDays} ${data.activeStage.startsInDays > 1 ? 'jours' : 'jour'}`
      : 'En cours',
  );

  let livePresentCount = $derived(
    data.liveEvent?.participations.filter((p: any) => p.isPresent).length || 0,
  );
  let liveProgressPercent = $derived(
    data.liveEvent && data.liveEvent._count.participations > 0
      ? Math.round(
          (livePresentCount / data.liveEvent._count.participations) * 100,
        )
      : 0,
  );
  let assignDialogOpen = $state(false);
  let assignDialogEvent = $state<{
    id: string;
    titre: string;
    mantaIds: string[];
  } | null>(null);

  function openAssignDialog(event: any) {
    assignDialogEvent = {
      id: event.id,
      titre: event.titre,
      mantaIds: event.mantas.map((m: any) => m.staffProfileId),
    };
    assignDialogOpen = true;
  }

  type TaskRow = {
    key: string;
    icon: typeof UserPlus;
    title: string;
    description: string;
    count: number | undefined;
    severity: 'info' | 'warning' | 'danger';
    href?: string;
    onclick?: () => void;
  };

  const taskRows = $derived<TaskRow[]>(
    data.role === 'manta'
      ? []
      : [
          ...(data.tasks?.eventsMissingMantas ?? []).map(
            (ev): TaskRow => ({
              key: `missing-mantas-${ev.id}`,
              icon: UserPlus,
              title: 'Événement sans Mantas',
              description: `${ev.titre} — aucun manta assigné`,
              count: undefined,
              severity: 'warning',
              onclick: () => {
                assignDialogEvent = {
                  id: ev.id,
                  titre: ev.titre,
                  mantaIds: [],
                };
                assignDialogOpen = true;
              },
            }),
          ),
          ...(data.tasks?.eventsMissingPlanning ?? []).map(
            (ev): TaskRow => ({
              key: `missing-planning-${ev.id}`,
              icon: CalendarClock,
              title: 'Planning à construire',
              description: `${ev.titre} — aucun créneau`,
              count: undefined,
              severity: 'warning',
              href: resolve(`/staff/pedago/events/${ev.id}/planning`),
            }),
          ),
          ...(data.tasks?.eventsWithUnassignedSlots ?? []).map(
            (ev): TaskRow => ({
              key: `unassigned-${ev.id}`,
              icon: TriangleAlert,
              title: 'Créneaux à assigner',
              description: `${ev.titre} — créneaux sans activité`,
              count: ev.unassignedCount,
              severity: 'warning',
              href: resolve(`/staff/pedago/events/${ev.id}/planning`),
            }),
          ),
        ],
  );
</script>

{#snippet stageCard(ctaLabel: string)}
  {#if data.activeStage}
    <Card.Root
      class="overflow-hidden border-t-4 border-t-epi-teal-solid shadow-md"
    >
      <div
        class="flex items-center justify-between border-b border-border/50 bg-muted/20 px-5 py-3"
      >
        <div class="flex items-center gap-2">
          <CalendarClock class="h-4 w-4 text-epi-teal-solid" />
          <div
            class="text-xs font-bold tracking-widest text-epi-teal-solid uppercase"
          >
            {data.activeStage.status === 'upcoming'
              ? 'Prochain stage'
              : 'Stage en cours'}
          </div>
        </div>
        <span
          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
        >
          {stageCountdownLabel}
        </span>
      </div>

      <Card.Content
        class="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center"
      >
        <div class="space-y-1">
          <h2 class="font-heading text-2xl text-foreground">
            {data.activeStage.titre}
          </h2>
          <p
            class="flex items-center gap-2 text-sm font-medium text-muted-foreground"
          >
            <CalendarDays class="h-4 w-4" />
            Démarre le {formatDate(new Date(data.activeStage.startDate))}
          </p>
        </div>

        <Button
          class="bg-epi-blue text-white shadow-sm hover:bg-epi-blue/90"
          href={resolve(`/staff/pedago/events/${data.activeStage.id}/planning`)}
        >
          <CalendarDays class="mr-2 h-4 w-4" />
          {ctaLabel}
        </Button>
      </Card.Content>
    </Card.Root>
  {/if}
{/snippet}

{#if data.role === 'manta'}
  <div class="space-y-8">
    <PageHeader title="Espace Manta" subtitle="Votre tableau de bord terrain" />

    {@render stageCard('Voir planning & sujets')}

    {#if data.liveEvent && data.isOnLiveEvent}
      <Card.Root class="overflow-hidden border-t-4 border-t-epi-blue shadow-md">
        <div
          class="flex items-center justify-between border-b border-border/50 bg-muted/20 px-5 py-3"
        >
          <div class="flex items-center gap-2">
            <span class="relative flex h-2 w-2">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-epi-blue opacity-75"
              ></span>
              <span
                class="relative inline-flex h-2 w-2 rounded-full bg-epi-blue"
              ></span>
            </span>
            <div
              class="text-xs font-bold tracking-widest text-epi-blue uppercase"
            >
              Événement en cours
            </div>
          </div>
          <span
            class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
            >Aujourd'hui</span
          >
        </div>

        <Card.Content
          class="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center"
        >
          <div class="space-y-1">
            <h2 class="font-heading text-2xl text-foreground">
              {data.liveEvent.titre}
            </h2>
            <p
              class="flex items-center gap-2 text-sm font-medium text-muted-foreground"
            >
              <Users class="h-4 w-4" />
              {data.liveEvent._count.participations} inscrits
              <span class="px-1.5 opacity-30">|</span>
              <span class="font-bold text-foreground">
                {livePresentCount} présents ({liveProgressPercent}%)
              </span>
            </p>
          </div>

          <div class="flex items-center gap-4">
            {#if data.activeAlertsCount > 0}
              <div
                class="inline-flex items-center gap-1.5 rounded-sm border border-epi-orange/20 bg-epi-orange/10 px-3 py-1 text-sm font-bold text-epi-orange"
              >
                <LifeBuoy class="h-4 w-4 animate-pulse" />
                {data.activeAlertsCount} Alerte{data.activeAlertsCount > 1
                  ? 's'
                  : ''}
              </div>
            {/if}

            <Button
              class="bg-epi-blue text-white shadow-sm hover:bg-epi-blue/90"
              href={resolve(
                `/staff/pedago/events/${data.liveEvent.id}/presences`,
              )}
            >
              <RadioTower class="mr-2 h-4 w-4" /> Rejoindre
            </Button>
          </div>
        </Card.Content>
      </Card.Root>
    {:else}
      <div
        class="flex items-center gap-4 rounded-sm border border-dashed border-border bg-muted/20 p-6 text-muted-foreground"
      >
        <Activity class="h-6 w-6 opacity-50" />
        <div>
          <p class="font-bold text-foreground">
            Aucun événement en cours aujourd'hui.
          </p>
          <p class="text-sm">
            C'est le moment idéal pour s'entraîner sur les sujets du catalogue.
          </p>
        </div>
      </div>
    {/if}

    {#if data.nextAssignedEvents && data.nextAssignedEvents.length > 0}
      <section class="space-y-3">
        <div
          class="text-sm font-bold tracking-widest text-muted-foreground uppercase"
        >
          Vos prochains événements
        </div>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {#each data.nextAssignedEvents as event}
            <div
              class="flex items-center justify-between rounded-sm border bg-card p-4 shadow-sm transition-all hover:border-epi-blue/50 hover:shadow-md"
            >
              <div class="flex items-center gap-4">
                <div
                  class="flex min-w-[3.5rem] shrink-0 flex-col items-center justify-center rounded-sm bg-muted/30 p-2"
                >
                  <span
                    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                  >
                    {new Date(event.date).toLocaleDateString('fr-FR', {
                      month: 'short',
                    })}
                  </span>
                  <span
                    class="mt-0.5 font-heading text-xl leading-none text-foreground"
                  >
                    {new Date(event.date).getDate()}
                  </span>
                </div>
                <div class="min-w-0">
                  <div
                    class="truncate text-sm font-bold tracking-tight text-foreground uppercase"
                  >
                    {event.titre}
                  </div>
                  <p class="mt-1 text-xs font-medium text-muted-foreground">
                    {event._count.participations} inscrits
                  </p>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <section class="space-y-3">
      <div class="flex items-baseline justify-between">
        <div
          class="text-sm font-bold tracking-widest text-muted-foreground uppercase"
        >
          Former sur les sujets
        </div>
        <Button
          variant="link"
          size="sm"
          href={resolve('/staff/pedago/catalogue')}
          class="text-xs"
        >
          Bibliothèque <ArrowRight class="ml-1 h-3 w-3" />
        </Button>
      </div>
      {#if data.cataloguePreview && data.cataloguePreview.length > 0}
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each data.cataloguePreview as template}
            <a
              href={resolve(`/staff/pedago/catalogue/${template.id}`)}
              class="block rounded-sm border bg-card p-4 shadow-sm transition-all hover:border-epi-blue/50 hover:shadow-md"
            >
              <div class="flex min-w-0 items-start gap-3">
                {#if template.isDynamic}
                  <Zap class="mt-0.5 h-4 w-4 shrink-0 text-epi-orange" />
                {:else}
                  <FileText
                    class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  />
                {/if}
                <div class="min-w-0">
                  <div class="truncate text-sm font-bold text-foreground">
                    {template.nom}
                  </div>
                  {#if template.difficulte}
                    <div
                      class="mt-0.5 text-[10px] tracking-wider text-muted-foreground uppercase"
                    >
                      {template.difficulte}
                    </div>
                  {/if}
                </div>
              </div>
            </a>
          {/each}
        </div>
      {:else}
        <div
          class="rounded-sm border border-dashed border-border bg-muted/10 py-8 text-center text-sm text-muted-foreground"
        >
          <BookOpenText class="mx-auto mb-2 h-5 w-5 opacity-50" />
          Aucun sujet disponible pour l'instant.
        </div>
      {/if}
    </section>
  </div>
{:else}
  <div class="space-y-8">
    <PageHeader
      title="Dashboard Pédago"
      subtitle="Centre des opérations académiques"
    />

    {@render stageCard('Préparer le planning')}

    {#if data.liveEvent}
      <Card.Root class="overflow-hidden border-t-4 border-t-epi-blue shadow-md">
        <div
          class="flex items-center justify-between border-b border-border/50 bg-muted/20 px-5 py-3"
        >
          <div class="flex items-center gap-2">
            <span class="relative flex h-2 w-2">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-epi-blue opacity-75"
              ></span>
              <span
                class="relative inline-flex h-2 w-2 rounded-full bg-epi-blue"
              ></span>
            </span>
            <div
              class="text-xs font-bold tracking-widest text-epi-blue uppercase"
            >
              Mission Control Live
            </div>
          </div>
          <span
            class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
            >Aujourd'hui</span
          >
        </div>

        <Card.Content
          class="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center"
        >
          <div class="space-y-1">
            <h2 class="font-heading text-2xl text-foreground">
              {data.liveEvent.titre}
            </h2>
            <div
              class="flex items-center gap-2 text-sm font-medium text-muted-foreground"
            >
              <span class="flex items-center gap-1.5"
                ><Users class="h-4 w-4" />
                {data.liveEvent._count.participations} inscrits</span
              >
              <span class="opacity-30">|</span>
              <span class="flex items-center gap-1.5"
                ><ShieldHalf class="h-4 w-4" />
                {data.liveEvent.mantas.length} Mantas</span
              >
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-6">
            <div
              class="flex items-center gap-3 rounded-sm bg-muted/30 px-4 py-2"
            >
              <div class="font-heading text-2xl leading-none text-epi-blue">
                {liveProgressPercent}%
              </div>
              <div
                class="text-[10px] leading-tight font-bold tracking-widest text-muted-foreground uppercase"
              >
                Présents<br />Réels
              </div>
            </div>

            {#if data.activeAlertsCount > 0}
              <div
                class="flex items-center gap-3 rounded-sm border border-epi-orange/20 bg-epi-orange/10 px-4 py-2"
              >
                <LifeBuoy class="h-5 w-5 animate-pulse text-epi-orange" />
                <div>
                  <div class="text-lg leading-none font-black text-epi-orange">
                    {data.activeAlertsCount}
                  </div>
                  <div
                    class="text-[10px] font-bold tracking-widest text-epi-orange/70 uppercase"
                  >
                    Alertes
                  </div>
                </div>
              </div>
            {:else}
              <div
                class="flex items-center gap-3 rounded-sm bg-muted/30 px-4 py-2"
              >
                <Activity class="h-5 w-5 text-muted-foreground" />
                <div>
                  <div
                    class="text-lg leading-none font-black text-muted-foreground"
                  >
                    0
                  </div>
                  <div
                    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                  >
                    C.A.S. Normal
                  </div>
                </div>
              </div>
            {/if}

            <Button
              class="bg-epi-blue text-white shadow-sm hover:bg-epi-blue/90"
              href={resolve(
                `/staff/pedago/events/${data.liveEvent.id}/presences`,
              )}
            >
              <RadioTower class="mr-2 h-4 w-4" /> Cockpit
            </Button>
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    {#if taskRows.length > 0}
      <section class="space-y-3">
        <div
          class="text-sm font-bold tracking-widest text-muted-foreground uppercase"
        >
          À préparer
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          {#each taskRows as row (row.key)}
            {#if row.onclick}
              <TaskQueueItem
                icon={row.icon}
                title={row.title}
                description={row.description}
                count={row.count}
                onclick={row.onclick}
                severity={row.severity}
              />
            {:else if row.href}
              <TaskQueueItem
                icon={row.icon}
                title={row.title}
                description={row.description}
                count={row.count}
                href={row.href}
                severity={row.severity}
              />
            {/if}
          {/each}
        </div>
      </section>
    {/if}

    <div id="upcoming">
      <Tabs.Root value="active" class="w-full">
        <Tabs.List
          class="mb-6 w-full justify-start rounded-none border-b bg-transparent p-0"
        >
          <Tabs.Trigger
            value="active"
            class="relative h-10 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pt-2 pb-3 text-xs font-bold tracking-wider text-muted-foreground uppercase data-[state=active]:border-b-epi-blue data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            À venir
          </Tabs.Trigger>
          <Tabs.Trigger
            value="past"
            class="relative h-10 rounded-none border-b-2 border-b-transparent bg-transparent px-4 pt-2 pb-3 text-xs font-bold tracking-wider text-muted-foreground uppercase data-[state=active]:border-b-epi-blue data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            Archives & Clôture
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="active">
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {#each data.upcomingEvents as event}
              <div
                class="group flex flex-col justify-between rounded-sm border bg-card p-5 shadow-sm transition-all hover:border-epi-blue/50 hover:shadow-md"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex min-w-0 items-start gap-4">
                    <div
                      class="flex min-w-[3.5rem] shrink-0 flex-col items-center justify-center rounded-sm bg-muted/30 p-2"
                    >
                      <span
                        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                      >
                        {new Date(event.date).toLocaleDateString('fr-FR', {
                          month: 'short',
                        })}
                      </span>
                      <span
                        class="mt-0.5 font-heading text-2xl leading-none text-foreground"
                      >
                        {new Date(event.date).getDate()}
                      </span>
                    </div>
                    <div class="min-w-0">
                      <div
                        class="truncate text-sm font-bold tracking-tight text-foreground uppercase"
                      >
                        {event.titre}
                      </div>
                      <div
                        class="mt-1 flex items-center gap-2 text-xs font-medium text-muted-foreground"
                      >
                        <span class="flex items-center gap-1.5"
                          ><Users class="h-3 w-3" />
                          {event._count.participations}</span
                        >
                        <span>•</span>
                        <span class="flex items-center gap-1.5"
                          ><ShieldHalf class="h-3 w-3" />
                          {event.mantas.length}</span
                        >
                      </div>
                    </div>
                  </div>

                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger
                      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-muted"
                    >
                      <Ellipsis class="h-4 w-4 text-muted-foreground" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end" class="w-48 rounded-sm">
                      <DropdownMenu.Item class="p-0">
                        {#snippet child({ props })}
                          <a
                            {...props}
                            href={resolve(
                              `/staff/pedago/events/${event.id}/planning`,
                            )}
                            class="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <CalendarDays class="mr-2 h-4 w-4" /> Builder Planning
                          </a>
                        {/snippet}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        onclick={() => openAssignDialog(event)}
                      >
                        <UserPlus class="h-4 w-4" /> Assigner Mantas
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item class="p-0">
                        {#snippet child({ props })}
                          <a
                            {...props}
                            href={resolve(
                              `/staff/pedago/events/${event.id}/factions`,
                            )}
                            class="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <ShieldHalf class="mr-2 h-4 w-4" /> Gérer les Factions
                          </a>
                        {/snippet}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Root>
                </div>

                <div
                  class="mt-5 flex justify-end border-t border-border/50 pt-4"
                >
                  <Button
                    size="sm"
                    variant="default"
                    class="gap-1.5 bg-epi-blue text-white shadow-sm hover:bg-epi-blue/90"
                    href={resolve(`/staff/pedago/events/${event.id}/presences`)}
                  >
                    <MonitorPlay class="h-3.5 w-3.5" />
                    Présences
                  </Button>
                </div>
              </div>
            {:else}
              <div
                class="col-span-full py-12 text-center border border-dashed border-border rounded-sm bg-muted/10 text-muted-foreground"
              >
                <CalendarDays class="mx-auto mb-3 h-6 w-6 opacity-30" />
                <p class="text-sm font-medium">
                  Aucun événement à venir sur ce campus.
                </p>
              </div>
            {/each}
          </div>
        </Tabs.Content>

        <Tabs.Content value="past">
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {#each data.pastEvents as event}
              <div
                class="flex flex-col justify-between rounded-sm border bg-card p-4 shadow-sm transition-all hover:border-epi-blue/30 hover:shadow-md"
              >
                <div class="min-w-0">
                  <div
                    class="truncate text-xs font-bold tracking-tight text-foreground uppercase"
                  >
                    {event.titre}
                  </div>
                  <div
                    class="mt-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground"
                  >
                    <ArchiveRestore class="h-3 w-3" />
                    <span class="truncate capitalize"
                      >{formatDate(event.date)}</span
                    >
                  </div>
                </div>
                <div
                  class="mt-4 flex justify-end border-t border-border/50 pt-3"
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-7 gap-1.5 px-2 text-[11px] text-epi-blue hover:bg-epi-blue/10 hover:text-epi-blue"
                    href={resolve(
                      `/staff/pedago/events/${event.id}/certificates`,
                    )}
                  >
                    <Award class="h-3 w-3" />
                    Diplômes
                  </Button>
                </div>
              </div>
            {:else}
              <div
                class="col-span-full py-12 text-center border border-dashed border-border rounded-sm bg-muted/10 text-muted-foreground"
              >
                <ArchiveRestore class="mx-auto mb-3 h-6 w-6 opacity-30" />
                <p class="text-sm font-medium">Aucun historique d'événement.</p>
              </div>
            {/each}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  </div>

  {#if assignDialogEvent}
    <AssignMantasDialog
      bind:open={assignDialogOpen}
      eventId={assignDialogEvent.id}
      eventTitle={assignDialogEvent.titre}
      mantas={data.campusMantas ?? []}
      currentMantaIds={assignDialogEvent.mantaIds}
    />
  {/if}
{/if}
