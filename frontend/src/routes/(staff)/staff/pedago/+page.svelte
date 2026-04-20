<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import * as Card from '$lib/components/ui/card';
  import * as Tabs from '$lib/components/ui/tabs';
  import { Button } from '$lib/components/ui/button';
  import { EVENT_TYPES } from '$lib/domain/event';
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
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import Badge from '$lib/components/ui/badge/badge.svelte';
  import TaskQueueItem from '$lib/components/staff/TaskQueueItem.svelte';
  import AssignMantasDialog from '$lib/components/events/AssignMantasDialog.svelte';

  let { data } = $props();

  function formatDate(date: Date): string {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: data.timezone,
    });
  }

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
  let cockpitRouteId = $derived(
    data.liveEvent?.planning?.timeSlots?.[0]?.activities?.[0]?.id,
  );

  // --- Pedago-only state (AssignMantas dialog) ---
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

  const taskRows = $derived(
    data.role === 'manta'
      ? []
      : [
          data.tasks && data.tasks.eventsMissingMantas.length > 0
            ? {
                key: 'missing-mantas',
                icon: UserPlus,
                title: 'Événements sans Mantas',
                description:
                  data.tasks.eventsMissingMantas.length === 1
                    ? `${data.tasks.eventsMissingMantas[0].titre} dans ≤ 7 jours`
                    : `${data.tasks.eventsMissingMantas.length} événements dans ≤ 7 jours attendent un staffing`,
                count: data.tasks.eventsMissingMantas.length,
                href: '#upcoming',
                severity: 'warning' as const,
              }
            : null,
          data.tasks && data.tasks.eventsMissingPlanning.length > 0
            ? {
                key: 'missing-planning',
                icon: CalendarClock,
                title: 'Planning à construire',
                description:
                  data.tasks.eventsMissingPlanning.length === 1
                    ? `${data.tasks.eventsMissingPlanning[0].titre} — aucun créneau`
                    : `${data.tasks.eventsMissingPlanning.length} événements dans ≤ 7 jours sans planning`,
                count: data.tasks.eventsMissingPlanning.length,
                href:
                  data.tasks.eventsMissingPlanning.length === 1
                    ? resolve(
                        `/staff/pedago/events/${data.tasks.eventsMissingPlanning[0].id}/planning`,
                      )
                    : '#upcoming',
                severity: 'warning' as const,
              }
            : null,
        ].filter((r): r is NonNullable<typeof r> => r !== null),
  );
</script>

{#if data.role === 'manta'}
  <!-- ═══════════════════════════════════════════════════ MANTA VIEW -->
  <div class="space-y-8">
    <PageHeader title="Espace Manta" subtitle="Votre tableau de bord terrain" />

    {#if data.liveEvent && data.isOnLiveEvent}
      <!-- Live event assigned to this manta: big CTA -->
      <Card.Root
        class="overflow-hidden border-2 border-epi-blue shadow-xl dark:shadow-none"
      >
        <div
          class="flex items-center justify-between border-b border-epi-blue/20 bg-epi-blue/10 px-6 py-4"
        >
          <div class="flex items-center gap-3">
            <span class="relative flex h-3 w-3">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-epi-blue opacity-75"
              ></span>
              <span
                class="relative inline-flex h-3 w-3 rounded-full bg-epi-blue"
              ></span>
            </span>
            <h2
              class="font-heading text-lg tracking-wider text-epi-blue uppercase"
            >
              Événement en cours
            </h2>
          </div>
          <Badge
            variant="outline"
            class="border-epi-blue bg-epi-blue/20 text-epi-blue"
            >Aujourd'hui</Badge
          >
        </div>

        <Card.Content class="space-y-4 p-6">
          <div>
            <h3 class="text-3xl font-black tracking-tight uppercase">
              {data.liveEvent.titre}
            </h3>
            <p
              class="mt-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"
            >
              <Users class="h-4 w-4" />
              {data.liveEvent._count.participations} inscrits
              <span class="px-2 opacity-30">|</span>
              <span class="flex items-center gap-1 font-bold text-foreground">
                {livePresentCount} présents ({liveProgressPercent}%)
              </span>
            </p>
          </div>

          {#if data.activeAlertsCount > 0}
            <div
              class="flex items-center gap-2 rounded-md border border-epi-orange/30 bg-epi-orange/10 px-4 py-2 text-sm font-bold text-epi-orange"
            >
              <LifeBuoy class="h-4 w-4 animate-pulse" />
              {data.activeAlertsCount} Talent{data.activeAlertsCount > 1
                ? 's'
                : ''} demande{data.activeAlertsCount > 1 ? 'nt' : ''} de l'aide
            </div>
          {/if}
        </Card.Content>
        <Card.Footer class="border-t bg-muted/30 p-4">
          <Button
            size="lg"
            class="w-full bg-epi-blue text-base text-white shadow-lg hover:bg-epi-blue/90 dark:shadow-none"
            href={cockpitRouteId
              ? resolve(
                  `/staff/pedago/events/${data.liveEvent.id}/cockpit/${cockpitRouteId}`,
                )
              : resolve(`/staff/pedago/events/${data.liveEvent.id}/cockpit`)}
          >
            <RadioTower class="mr-2 h-5 w-5" /> Rejoindre le Cockpit
          </Button>
        </Card.Footer>
      </Card.Root>
    {:else}
      <!-- No live event or not assigned -->
      <Card.Root class="dark:shadow-none dark:ring-1 dark:ring-border/50">
        <Card.Content class="flex items-center gap-4 p-6">
          <Activity class="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p class="font-bold">Aucun événement en cours aujourd'hui.</p>
            <p class="text-sm text-muted-foreground">
              C'est le moment idéal pour s'entraîner sur les sujets du
              catalogue.
            </p>
          </div>
        </Card.Content>
      </Card.Root>
    {/if}

    <!-- Next assigned events (Redesigned to sleek list) -->
    {#if data.nextAssignedEvents && data.nextAssignedEvents.length > 0}
      <section class="space-y-3">
        <h2 class="font-heading text-lg tracking-wider uppercase">
          Vos prochains événements<span class="text-epi-teal">_</span>
        </h2>
        <div class="grid gap-3">
          {#each data.nextAssignedEvents as event}
            <div
              class="group flex items-center justify-between rounded-lg border bg-card p-3 shadow-sm transition-all hover:border-epi-blue dark:border-border/50 dark:shadow-none"
            >
              <div class="flex items-center gap-4">
                <div
                  class="flex min-w-[4rem] flex-col items-center justify-center rounded-md border border-border/50 bg-muted/50 px-3 py-1.5"
                >
                  <span
                    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                    >{new Date(event.date).toLocaleDateString('fr-FR', {
                      month: 'short',
                    })}</span
                  >
                  <span class="font-heading text-xl text-foreground"
                    >{new Date(event.date).getDate()}</span
                  >
                </div>
                <div>
                  <p class="text-sm font-bold tracking-tight uppercase">
                    {event.titre}
                  </p>
                  <div class="mt-1 flex items-center gap-2">
                    <Badge variant="secondary" class="px-1.5 py-0 text-[10px]"
                      >{event._count.participations} inscrits</Badge
                    >
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Catalogue preview -->
    <section class="space-y-3">
      <div class="flex items-baseline justify-between">
        <h2 class="font-heading text-lg tracking-wider uppercase">
          Former sur les sujets<span class="text-epi-teal">_</span>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          href={resolve('/staff/pedago/catalogue')}
          class="gap-1 text-xs"
        >
          Ouvrir la bibliothèque <ArrowRight class="h-3 w-3" />
        </Button>
      </div>
      {#if data.cataloguePreview && data.cataloguePreview.length > 0}
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {#each data.cataloguePreview as template}
            <Card.Root
              class="shadow-sm transition-all hover:shadow-md dark:shadow-none dark:ring-1 dark:ring-border/50"
            >
              <Card.Content class="flex items-start gap-3 p-4">
                <div class="mt-1 shrink-0">
                  {#if template.isDynamic}
                    <Zap class="h-4 w-4 text-epi-orange" />
                  {:else}
                    <FileText class="h-4 w-4 text-muted-foreground" />
                  {/if}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-bold">{template.nom}</p>
                  {#if template.difficulte}
                    <Badge
                      variant="outline"
                      class="mt-1 border-epi-blue text-[9px] text-blue-700 uppercase dark:text-blue-300"
                    >
                      {template.difficulte}
                    </Badge>
                  {/if}
                </div>
              </Card.Content>
            </Card.Root>
          {/each}
        </div>
      {:else}
        <div
          class="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground"
        >
          <BookOpenText class="mx-auto mb-2 h-6 w-6 opacity-50" />
          Aucun sujet disponible pour l'instant.
        </div>
      {/if}
    </section>
  </div>
{:else}
  <!-- ═══════════════════════════════════════════════════ PEDAGO VIEW -->
  <div class="space-y-6">
    <PageHeader
      title="Dashboard Pédago"
      subtitle="Centre des opérations académiques"
    />

    <!-- LIVE HEALTH DASHBOARD -->
    {#if data.liveEvent}
      <Card.Root
        class="mb-8 overflow-hidden border-2 border-epi-blue shadow-lg dark:shadow-none"
      >
        <div
          class="flex items-center justify-between border-b border-epi-blue/20 bg-epi-blue/10 px-6 py-4"
        >
          <div class="flex items-center gap-3">
            <span class="relative flex h-3 w-3">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-epi-blue opacity-75"
              ></span>
              <span
                class="relative inline-flex h-3 w-3 rounded-full bg-epi-blue"
              ></span>
            </span>
            <h2
              class="font-heading text-lg tracking-wider text-epi-blue uppercase"
            >
              Mission Control Live
            </h2>
          </div>
          <Badge
            variant="outline"
            class="border-epi-blue bg-epi-blue/20 text-epi-blue"
            >Aujourd'hui</Badge
          >
        </div>

        <Card.Content class="p-6">
          <div class="grid items-center gap-8 md:grid-cols-12">
            <div class="space-y-2 md:col-span-4">
              <h3 class="text-2xl font-bold tracking-tight uppercase">
                {data.liveEvent.titre}
              </h3>
              <div
                class="flex items-center gap-2 text-sm font-medium text-muted-foreground"
              >
                <Users class="h-4 w-4" />
                {data.liveEvent._count.participations} inscrits
                <span class="px-2 opacity-30">|</span>
                <ShieldHalf class="h-4 w-4" />
                {data.liveEvent.mantas.length} Mantas
              </div>
            </div>

            <div class="space-y-4 md:col-span-5">
              <div class="flex items-end justify-between">
                <div class="space-y-1">
                  <span
                    class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
                    >Taux de Présence</span
                  >
                  <div class="text-3xl font-black">{liveProgressPercent}%</div>
                </div>
                <div class="space-y-1 text-right">
                  <span
                    class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
                    >Présents réels</span
                  >
                  <div class="text-2xl font-bold">
                    {livePresentCount}
                    <span class="text-sm font-normal text-muted-foreground"
                      >/ {data.liveEvent._count.participations}</span
                    >
                  </div>
                </div>
              </div>

              <div
                class="relative h-4 w-full overflow-hidden rounded-full bg-muted shadow-inner dark:bg-muted/30"
              >
                <div
                  class="relative h-full bg-epi-blue transition-all duration-1000"
                  style="width: {liveProgressPercent}%"
                >
                  <div
                    class="animate-stripes absolute inset-0 h-full w-full bg-[linear-gradient(45deg,rgba(255,255,255,.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.2)_50%,rgba(255,255,255,.2)_75%,transparent_75%,transparent)] bg-size-[1rem_1rem]"
                  ></div>
                </div>
              </div>
            </div>

            <div class="flex justify-end md:col-span-3">
              <div
                class="w-full rounded-xl border bg-slate-900 p-4 text-center text-white shadow-inner dark:bg-slate-950"
              >
                <div
                  class="text-3xl font-black {data.activeAlertsCount > 0
                    ? 'animate-pulse text-epi-orange'
                    : 'text-slate-400'}"
                >
                  {data.activeAlertsCount}
                </div>
                <div
                  class="mt-1 flex items-center justify-center gap-1 text-[10px] font-bold tracking-widest uppercase"
                >
                  {#if data.activeAlertsCount > 0}
                    <LifeBuoy class="h-3 w-3 text-epi-orange" /> Alertes Actives
                  {:else}
                    <Activity class="h-3 w-3 text-slate-400" /> C.A.S. Normal
                  {/if}
                </div>
              </div>
            </div>
          </div>
        </Card.Content>
        <Card.Footer class="flex gap-4 border-t bg-muted/30 p-4">
          <Button
            size="lg"
            class="flex-1 bg-epi-blue text-base text-white shadow-lg hover:bg-epi-blue/90 dark:shadow-none"
            href={cockpitRouteId
              ? resolve(
                  `/staff/pedago/events/${data.liveEvent.id}/cockpit/${cockpitRouteId}`,
                )
              : resolve(`/staff/pedago/events/${data.liveEvent.id}/cockpit`)}
          >
            <RadioTower class="mr-2 h-5 w-5" /> Entrer dans le Cockpit
          </Button>
        </Card.Footer>
      </Card.Root>
    {/if}

    <!-- TASK QUEUE -->
    {#if taskRows.length > 0}
      <section class="space-y-3">
        <div class="flex items-baseline justify-between">
          <h2 class="font-heading text-lg tracking-wider uppercase">
            À préparer<span class="text-epi-teal">_</span>
          </h2>
          <span
            class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            {taskRows.length} élément{taskRows.length > 1 ? 's' : ''}
          </span>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          {#each taskRows as row (row.key)}
            {#if row.key === 'missing-mantas'}
              <!-- Special handling: open dialog instead of navigating when single event -->
              {#if data.tasks.eventsMissingMantas.length === 1}
                <button
                  type="button"
                  class="w-full text-left"
                  onclick={() => {
                    const ev = data.upcomingEvents.find(
                      (e) => e.id === data.tasks.eventsMissingMantas[0].id,
                    );
                    if (ev) openAssignDialog(ev);
                  }}
                >
                  <TaskQueueItem
                    icon={row.icon}
                    title={row.title}
                    description={row.description}
                    count={row.count}
                    href="#upcoming"
                    severity={row.severity}
                  />
                </button>
              {:else}
                <TaskQueueItem
                  icon={row.icon}
                  title={row.title}
                  description={row.description}
                  count={row.count}
                  href="#upcoming"
                  severity={row.severity}
                />
              {/if}
            {:else}
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
        <Tabs.List class="mb-6 grid w-full max-w-md grid-cols-2">
          <Tabs.Trigger value="active">À venir</Tabs.Trigger>
          <Tabs.Trigger value="past">Archives & Clôture</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="active">
          <!-- Redesigned to sleek list layout -->
          <div class="grid gap-4 md:grid-cols-2">
            {#each data.upcomingEvents as event}
              <div
                class="group flex flex-col justify-between rounded-lg border bg-card p-4 shadow-sm transition-all hover:border-epi-blue hover:shadow-md dark:border-border/50 dark:shadow-none"
              >
                <div class="flex items-start gap-4">
                  <div
                    class="flex min-w-[4rem] flex-col items-center justify-center rounded-md border border-border/50 bg-muted/50 px-3 py-2"
                  >
                    <span
                      class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                      >{new Date(event.date).toLocaleDateString('fr-FR', {
                        month: 'short',
                      })}</span
                    >
                    <span class="font-heading text-xl text-foreground"
                      >{new Date(event.date).getDate()}</span
                    >
                  </div>
                  <div class="flex-1">
                    <div class="flex items-start justify-between">
                      <h3 class="text-sm font-bold tracking-tight uppercase">
                        {event.titre}
                      </h3>
                      {#if event.eventType === EVENT_TYPES.STAGE_SECONDE}
                        <span
                          class="rounded-sm border border-purple-200 bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-700 dark:border-purple-900/50 dark:bg-purple-900/20 dark:text-purple-300"
                          >STAGE</span
                        >
                      {/if}
                    </div>
                    <div
                      class="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
                    >
                      <span
                        class="flex items-center gap-1.5 font-medium text-foreground"
                        ><Users class="h-3.5 w-3.5 text-epi-blue" />
                        {event._count.participations} inscrits</span
                      >
                      <span class="flex items-center gap-1.5"
                        ><ShieldHalf class="h-3.5 w-3.5" />
                        {event.mantas.length} Mantas</span
                      >
                    </div>
                  </div>
                </div>

                <div class="mt-4 grid w-full grid-cols-4 gap-2 border-t pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5 bg-muted/20 text-xs"
                    href={resolve(`/staff/pedago/events/${event.id}/planning`)}
                  >
                    <CalendarDays class="h-3.5 w-3.5" />
                    <span class="hidden sm:inline">Planning</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5 bg-muted/20 text-xs"
                    onclick={() => openAssignDialog(event)}
                  >
                    <UserPlus class="h-3.5 w-3.5" />
                    <span class="hidden sm:inline">Mantas</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="gap-1.5 bg-muted/20 text-xs"
                    href={resolve(`/staff/pedago/events/${event.id}/factions`)}
                  >
                    <ShieldHalf class="h-3.5 w-3.5" />
                    <span class="hidden sm:inline">Factions</span>
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    class="gap-1.5 bg-epi-blue text-xs text-white shadow-sm hover:bg-epi-blue/90 dark:shadow-none"
                    href={resolve(`/staff/pedago/events/${event.id}/cockpit`)}
                  >
                    <MonitorPlay class="h-3.5 w-3.5" />
                    <span class="hidden sm:inline">Cockpit</span>
                  </Button>
                </div>
              </div>
            {:else}
              <div
                class="col-span-full py-12 text-center border-2 border-dashed rounded-lg bg-muted/10"
              >
                <p class="text-muted-foreground">
                  Aucun événement à venir sur ce campus.
                </p>
              </div>
            {/each}
          </div>
        </Tabs.Content>

        <Tabs.Content value="past">
          <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {#each data.pastEvents as event}
              <Card.Root
                class="flex flex-col opacity-80 shadow-sm transition-opacity hover:opacity-100 dark:border-border/50 dark:shadow-none"
              >
                <Card.Header class="border-b pb-3">
                  <div class="flex items-start justify-between">
                    <Card.Title
                      class="text-base leading-tight text-muted-foreground uppercase"
                      >{event.titre}</Card.Title
                    >
                  </div>
                  <Card.Description
                    class="mt-2 flex items-center gap-1.5 font-medium"
                  >
                    <ArchiveRestore class="h-4 w-4" />
                    <span class="capitalize">{formatDate(event.date)}</span>
                  </Card.Description>
                </Card.Header>

                <Card.Content class="flex-1 py-4">
                  <div
                    class="flex items-center gap-4 text-sm text-muted-foreground"
                  >
                    <div class="flex items-center gap-1.5">
                      <Users class="h-4 w-4" />
                      <span>{event._count.participations} inscrits</span>
                    </div>
                  </div>
                </Card.Content>

                <Card.Footer class="border-t bg-muted/20 p-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    class="w-full gap-1.5 bg-background text-xs hover:bg-muted"
                    href={resolve(
                      `/staff/pedago/events/${event.id}/certificates`,
                    )}
                  >
                    <Award class="h-3.5 w-3.5 text-epi-blue" />
                    Générer les Diplômes
                  </Button>
                </Card.Footer>
              </Card.Root>
            {:else}
              <div
                class="col-span-full py-12 text-center border-2 border-dashed rounded-lg bg-muted/10"
              >
                <p class="text-muted-foreground">
                  Aucun historique d'événement.
                </p>
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
