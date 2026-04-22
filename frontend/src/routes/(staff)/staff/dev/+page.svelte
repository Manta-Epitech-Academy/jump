<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Avatar from '$lib/components/ui/avatar';
  import TaskQueueItem from '$lib/components/staff/TaskQueueItem.svelte';
  import {
    CalendarDays,
    Target,
    ArrowRight,
    Users,
    MessageSquare,
    TrendingUp,
    Trophy,
    Medal,
    UserPlus,
    CalendarClock,
    PhoneCall,
    AlarmClock,
    Inbox,
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';

  let { data } = $props();

  const minimalist = $derived(Boolean(data.minimalist));

  const activeStage = $derived(
    page.data.activeStage as { id: string; titre: string } | null,
  );
  const interviewsHref = $derived(
    activeStage
      ? resolve(`/staff/dev/events/${activeStage.id}/interviews`)
      : null,
  );

  const todayStr = $derived(
    new Date().toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: data.timezone,
    }),
  );

  const taskRows = $derived(
    [
      data.tasks.eventsMissingMantas.length > 0
        ? {
            key: 'mantas',
            icon: UserPlus,
            title: 'Événements sans Mantas',
            description:
              data.tasks.eventsMissingMantas.length === 1
                ? `${data.tasks.eventsMissingMantas[0].titre} dans ≤ 7 jours`
                : `${data.tasks.eventsMissingMantas.length} événements dans ≤ 7 jours attendent un staffing`,
            count: data.tasks.eventsMissingMantas.length,
            href:
              data.tasks.eventsMissingMantas.length === 1
                ? resolve(
                    `/staff/dev/events/${data.tasks.eventsMissingMantas[0].id}/manage`,
                  )
                : resolve('/staff/dev/events/history'),
            severity: 'warning' as const,
          }
        : null,
      data.tasks.eventsMissingPlanning.length > 0
        ? {
            key: 'planning',
            icon: CalendarClock,
            title: 'Planning à construire',
            description:
              data.tasks.eventsMissingPlanning.length === 1
                ? `${data.tasks.eventsMissingPlanning[0].titre} — aucun créneau pour l'instant`
                : `${data.tasks.eventsMissingPlanning.length} événements dans ≤ 7 jours sans planning`,
            count: data.tasks.eventsMissingPlanning.length,
            href:
              data.tasks.eventsMissingPlanning.length === 1
                ? resolve(
                    `/staff/dev/events/${data.tasks.eventsMissingPlanning[0].id}/manage`,
                  )
                : resolve('/staff/dev/events/history'),
            severity: 'warning' as const,
          }
        : null,
      data.tasks.interviewsToday > 0 && interviewsHref
        ? {
            key: 'interviews-today',
            icon: PhoneCall,
            title: 'Entretiens à mener aujourd\u2019hui',
            description:
              'Préparer la grille avant chaque entretien de mi-parcours',
            count: data.tasks.interviewsToday,
            href: interviewsHref,
            severity: 'info' as const,
          }
        : null,
      data.tasks.overdueInterviews > 0 && interviewsHref
        ? {
            key: 'interviews-overdue',
            icon: AlarmClock,
            title: 'Entretiens en retard',
            description: 'Reprogrammer ou marquer comme terminé',
            count: data.tasks.overdueInterviews,
            href: interviewsHref,
            severity: 'danger' as const,
          }
        : null,
    ].filter((row): row is NonNullable<typeof row> => row !== null),
  );

  function getMedalColor(index: number) {
    if (index === 0)
      return 'text-yellow-500 fill-yellow-100 dark:fill-yellow-900/30';
    if (index === 1)
      return 'text-slate-400 fill-slate-100 dark:fill-slate-800/50';
    if (index === 2)
      return 'text-amber-700 fill-amber-100 dark:text-amber-500 dark:fill-amber-900/30';
    return 'text-transparent';
  }
</script>

{#if minimalist}
  <div
    class="mx-auto mt-12 max-w-xl rounded-sm border border-dashed bg-card px-8 py-12 text-center shadow-sm dark:shadow-none"
  >
    <Inbox class="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
    <h1 class="mb-2 font-heading text-2xl tracking-wide uppercase">
      Aucun stage en cours
    </h1>
    <p class="text-sm leading-relaxed text-muted-foreground">
      Ce campus est configuré en mode Stage de Seconde. Dès qu'un stage est
      planifié, il s'affichera automatiquement ici. Contactez un administrateur
      si vous attendez d'autres fonctionnalités.
    </p>
  </div>
{:else}
  <div class="space-y-8">
    <!-- HERO BANNER -->
    <div
      class="relative overflow-hidden rounded-sm bg-linear-to-r from-epi-blue via-blue-800 to-slate-900 px-8 py-10 text-white shadow-md dark:shadow-none"
    >
      <div class="absolute -top-20 -right-20 opacity-20 mix-blend-overlay">
        <TrendingUp class="h-96 w-96" />
      </div>
      <div class="relative z-10">
        <h1 class="mb-2 font-heading text-4xl tracking-wide uppercase">
          Bienvenue, <span class="text-epi-teal">{data.userName}</span>.
        </h1>
        <p class="max-w-xl text-sm leading-relaxed font-medium text-blue-100">
          Nous sommes le {todayStr} sur le campus de {data.campusName}.
          {#if data.ongoingEvents.length > 0}
            Actuellement se déroule l'évènement <strong
              >{data.ongoingEvents[0].titre}</strong
            >
            avec
            <strong
              >{data.ongoingEvents[0]._count.participations} participants</strong
            >. Allez les rencontrer !
          {:else if activeStage}
            C'est le moment idéal pour faire le point sur les entretiens du
            stage en cours.
          {:else}
            Aucun événement n'est en cours. Utilisez ce temps calme pour
            préparer la suite.
          {/if}
        </p>
      </div>
    </div>

    <!-- TASK QUEUE -->
    <section class="space-y-3">
      <div class="flex items-baseline justify-between">
        <h2
          class="font-sans text-base font-bold tracking-wide text-foreground uppercase"
        >
          À traiter
        </h2>
      </div>

      {#if taskRows.length === 0}
        <div
          class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 py-10 text-muted-foreground"
        >
          <Inbox class="mb-2 h-8 w-8 opacity-50" />
          <p class="text-sm font-medium">Inbox Zero. Rien ne presse.</p>
        </div>
      {:else}
        <div class="grid gap-3 md:grid-cols-2">
          {#each taskRows as row (row.key)}
            <TaskQueueItem
              icon={row.icon}
              title={row.title}
              description={row.description}
              count={row.count}
              href={row.href}
              severity={row.severity}
            />
          {/each}
        </div>
      {/if}
    </section>

    <!-- KPI STRIP -->
    <div class="grid gap-4 {activeStage ? 'md:grid-cols-3' : 'md:grid-cols-1'}">
      <Card.Root
        class="rounded-sm border-l-4 border-l-epi-blue shadow-sm dark:shadow-none"
      >
        <Card.Content class="flex items-center justify-between p-5">
          <div>
            <p
              class="mb-1 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
            >
              Total Talents
            </p>
            <p class="text-3xl font-black text-foreground">
              {data.kpis.totalTalents}
            </p>
          </div>
          <div
            class="flex h-12 w-12 items-center justify-center rounded-sm bg-blue-50 text-epi-blue dark:bg-blue-900/20"
          >
            <Users class="h-6 w-6" />
          </div>
        </Card.Content>
      </Card.Root>

      {#if activeStage && data.kpis.completedInterviews !== null}
        <Card.Root
          class="rounded-sm border-l-4 border-l-epi-teal-solid shadow-sm dark:shadow-none"
        >
          <Card.Content class="flex items-center justify-between p-5">
            <div>
              <p
                class="mb-1 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
              >
                Entretiens du stage
              </p>
              <p class="text-3xl font-black text-foreground">
                {data.kpis.completedInterviews}
              </p>
            </div>
            <div
              class="flex h-12 w-12 items-center justify-center rounded-sm bg-epi-teal-solid/10 text-epi-teal-solid"
            >
              <MessageSquare class="h-6 w-6" />
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root
          class="rounded-sm border-l-4 border-l-epi-orange shadow-sm dark:shadow-none"
        >
          <Card.Content class="flex items-center justify-between p-5">
            <div>
              <p
                class="mb-1 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
              >
                Entretiens planifiés
              </p>
              <p class="text-3xl font-black text-foreground">
                {data.kpis.plannedInterviews}
              </p>
            </div>
            <div
              class="flex h-12 w-12 items-center justify-center rounded-sm bg-orange-50 text-epi-orange dark:bg-orange-900/20"
            >
              <Target class="h-6 w-6" />
            </div>
          </Card.Content>
        </Card.Root>
      {/if}
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <!-- LEADERBOARD -->
      <Card.Root class="flex flex-col rounded-sm shadow-sm dark:shadow-none">
        <Card.Header class="border-b bg-muted/30 pt-4 pb-3">
          <Card.Title
            class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            <Trophy class="h-4 w-4 text-yellow-500" />
            Top Talents (Leaderboard)
          </Card.Title>
        </Card.Header>
        <Card.Content class="p-0">
          <div class="divide-y divide-border/50">
            {#each data.topTalents as talent, index}
              <a
                href={resolve(`/staff/dev/students/${talent.id}`)}
                class="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/30"
              >
                <div
                  class="flex w-6 items-center justify-center font-heading text-xl text-muted-foreground group-hover:text-epi-blue"
                >
                  {#if index < 3}
                    <Medal class={`h-6 w-6 ${getMedalColor(index)}`} />
                  {:else}
                    <div
                      class="flex h-6 w-6 items-center justify-center rounded-sm bg-muted/50 text-sm font-bold text-muted-foreground"
                    >
                      {index + 1}
                    </div>
                  {/if}
                </div>
                <Avatar.Root
                  class="h-8 w-8 rounded-sm border shadow-sm dark:shadow-none"
                >
                  <Avatar.Fallback
                    class="bg-primary/10 text-[10px] font-bold text-primary"
                  >
                    {talent.nom[0]}{talent.prenom[0]}
                  </Avatar.Fallback>
                </Avatar.Root>
                <div class="min-w-0 flex-1">
                  <p
                    class="truncate text-sm font-bold uppercase transition-colors group-hover:text-epi-blue"
                  >
                    {talent.nom} <span class="capitalize">{talent.prenom}</span>
                  </p>
                  <p
                    class="truncate text-[10px] tracking-widest text-muted-foreground uppercase"
                  >
                    {talent.niveau || 'Niveau inconnu'}
                  </p>
                </div>
                <div class="flex items-baseline gap-1 text-right">
                  <span
                    class="text-xl font-black text-epi-orange italic drop-shadow-sm dark:drop-shadow-none"
                  >
                    {talent.xp}
                  </span>
                  <span
                    class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase not-italic"
                  >
                    XP
                  </span>
                </div>
              </a>
            {:else}
              <div
                class="p-8 text-center text-sm font-medium text-muted-foreground"
              >
                Le leaderboard est vide.
              </div>
            {/each}
          </div>
        </Card.Content>
        <Card.Footer class="border-t bg-muted/10 p-3">
          <Button
            variant="ghost"
            size="sm"
            class="w-full text-[10px] font-bold tracking-widest uppercase"
            href={resolve('/staff/dev/students')}
          >
            Ouvrir le CRM <ArrowRight class="ml-2 h-3 w-3" />
          </Button>
        </Card.Footer>
      </Card.Root>

      <!-- ÉVÉNEMENTS A VENIR + OBJECTIFS -->
      <div class="flex flex-col space-y-6">
        <div class="space-y-3">
          <h3
            class="flex items-center gap-2 font-sans text-base font-bold tracking-wide text-foreground uppercase"
          >
            <CalendarDays class="h-4 w-4 text-epi-teal-solid" />
            Événements à venir
          </h3>
          <div class="flex flex-col gap-3">
            {#each data.upcomingEvents as event}
              <div
                class="group flex items-center justify-between rounded-sm border bg-card p-4 shadow-sm transition-all hover:border-epi-teal-solid hover:shadow-md dark:border-border/50 dark:shadow-none"
              >
                <div class="flex items-center gap-4">
                  <div
                    class="flex min-w-[3.5rem] shrink-0 flex-col items-center justify-center rounded-sm bg-muted/30 p-2"
                  >
                    <span
                      class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                      >{new Date(event.date).toLocaleDateString('fr-FR', {
                        month: 'short',
                      })}</span
                    >
                    <span
                      class="mt-0.5 font-heading text-xl leading-none text-foreground"
                      >{new Date(event.date).getDate()}</span
                    >
                  </div>
                  <div class="min-w-0">
                    <p class="truncate text-sm font-bold uppercase">
                      {event.titre}
                    </p>
                    <div class="mt-1 text-xs font-medium text-muted-foreground">
                      {event._count.participations} inscrits
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  href={resolve(`/staff/dev/events/${event.id}/manage`)}
                  class="shrink-0 rounded-sm bg-background text-xs transition-colors group-hover:border-epi-teal-solid group-hover:bg-epi-teal-solid group-hover:text-white"
                >
                  Gérer
                </Button>
              </div>
            {:else}
              <div
                class="rounded-sm border border-dashed bg-muted/10 py-8 text-center text-sm font-medium text-muted-foreground"
              >
                Aucun événement prévu prochainement.
              </div>
            {/each}
          </div>
        </div>

        {#if data.stageObjectives}
          <Card.Root class="rounded-sm shadow-sm dark:shadow-none">
            <Card.Header class="border-b bg-muted/30 pt-4 pb-3">
              <Card.Title
                class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
              >
                <Target class="h-4 w-4 text-epi-teal-solid" />
                Objectifs du stage en cours
              </Card.Title>
            </Card.Header>
            <Card.Content class="space-y-5 pt-5">
              <div class="space-y-1.5">
                <div class="flex justify-between text-sm font-bold">
                  <span>Entretiens menés</span>
                  <span class="text-epi-blue"
                    >{data.stageObjectives.interviews}
                    <span class="text-muted-foreground"
                      >/ {data.stageObjectives.interviewsTarget}</span
                    ></span
                  >
                </div>
                <div
                  class="h-2.5 overflow-hidden rounded-full bg-muted shadow-inner dark:bg-muted/30"
                >
                  <div
                    class="h-full bg-linear-to-r from-epi-blue to-blue-400 transition-all duration-1000 ease-out"
                    style="width: {data.stageObjectives.interviewsTarget
                      ? (data.stageObjectives.interviews /
                          data.stageObjectives.interviewsTarget) *
                        100
                      : 0}%"
                  ></div>
                </div>
              </div>
              <div class="space-y-1.5">
                <div class="flex justify-between text-sm font-bold">
                  <span>Chartes signées</span>
                  <span class="text-epi-teal-solid"
                    >{data.stageObjectives.chartes}
                    <span class="text-muted-foreground"
                      >/ {data.stageObjectives.totalParticipations}</span
                    ></span
                  >
                </div>
                <div
                  class="h-2.5 overflow-hidden rounded-full bg-muted shadow-inner dark:bg-muted/30"
                >
                  <div
                    class="h-full bg-epi-teal-solid transition-all duration-1000 ease-out"
                    style="width: {data.stageObjectives.totalParticipations
                      ? (data.stageObjectives.chartes /
                          data.stageObjectives.totalParticipations) *
                        100
                      : 0}%"
                  ></div>
                </div>
              </div>
            </Card.Content>
          </Card.Root>
        {/if}
      </div>
    </div>
  </div>
{/if}
