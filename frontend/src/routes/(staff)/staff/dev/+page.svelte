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
    Flame,
    Snowflake,
    UserPlus,
    CalendarClock,
    PhoneCall,
    AlarmClock,
    Inbox,
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';

  let { data } = $props();

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
      data.tasks.interviewsToday > 0
        ? {
            key: 'interviews-today',
            icon: PhoneCall,
            title: 'Entretiens à mener aujourd\u2019hui',
            description:
              'Préparer la grille et les questions avant chaque appel',
            count: data.tasks.interviewsToday,
            href: resolve('/staff/dev/interviews'),
            severity: 'info' as const,
          }
        : null,
      data.tasks.overdueInterviews > 0
        ? {
            key: 'interviews-overdue',
            icon: AlarmClock,
            title: 'Entretiens en retard',
            description: 'Reprogrammer ou marquer comme terminé',
            count: data.tasks.overdueInterviews,
            href: resolve('/staff/dev/interviews'),
            severity: 'danger' as const,
          }
        : null,
    ].filter((row): row is NonNullable<typeof row> => row !== null),
  );

  function getMedalColor(index: number) {
    if (index === 0) return 'text-yellow-500 fill-yellow-100';
    if (index === 1) return 'text-slate-400 fill-slate-100';
    if (index === 2) return 'text-amber-700 fill-amber-100';
    return 'text-transparent';
  }
</script>

<div class="space-y-8">
  <!-- HERO BANNER -->
  <div
    class="relative overflow-hidden rounded-2xl bg-linear-to-r from-epi-blue via-blue-800 to-slate-900 px-8 py-10 text-white shadow-xl"
  >
    <div class="absolute -top-20 -right-20 opacity-20 mix-blend-overlay">
      <TrendingUp class="h-96 w-96" />
    </div>
    <div class="relative z-10">
      <h1 class="mb-2 font-heading text-4xl tracking-wide uppercase">
        Prêt à recruter, <span class="text-epi-teal">{data.userName}</span> ?
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
        {:else}
          Aucun événement n'est en cours. C'est le moment idéal pour faire vos
          appels d'admission et traiter vos Talents.
        {/if}
      </p>
    </div>
  </div>

  <!-- TASK QUEUE -->
  <section class="space-y-3">
    <div class="flex items-baseline justify-between">
      <h2 class="font-heading text-lg tracking-wider uppercase">
        À traiter<span class="text-epi-teal">_</span>
      </h2>
      {#if taskRows.length > 0}
        <span
          class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          {taskRows.length} élément{taskRows.length > 1 ? 's' : ''}
        </span>
      {/if}
    </div>

    {#if taskRows.length === 0}
      <div
        class="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-muted-foreground"
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
  <div class="grid gap-4 md:grid-cols-3">
    <Card.Root class="border-l-4 border-l-epi-blue shadow-sm">
      <Card.Content class="flex items-center justify-between p-6">
        <div>
          <p
            class="mb-1 text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            Total Talents
          </p>
          <p class="text-3xl font-black">{data.kpis.totalTalents}</p>
        </div>
        <div
          class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-epi-blue dark:bg-blue-900/20"
        >
          <Users class="h-6 w-6" />
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-l-4 border-l-epi-teal shadow-sm">
      <Card.Content class="flex items-center justify-between p-6">
        <div>
          <p
            class="mb-1 text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            Entretiens Réalisés
          </p>
          <p class="text-3xl font-black">{data.kpis.completedInterviews}</p>
        </div>
        <div
          class="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-epi-teal dark:bg-teal-900/20"
        >
          <MessageSquare class="h-6 w-6" />
        </div>
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-l-4 border-l-epi-orange shadow-sm">
      <Card.Content class="flex items-center justify-between p-6">
        <div>
          <p
            class="mb-1 text-xs font-bold tracking-widest text-muted-foreground uppercase"
          >
            Appels Planifiés
          </p>
          <p class="text-3xl font-black">{data.kpis.plannedInterviews}</p>
        </div>
        <div
          class="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-epi-orange dark:bg-orange-900/20"
        >
          <Target class="h-6 w-6" />
        </div>
      </Card.Content>
    </Card.Root>
  </div>

  <div class="grid gap-6 md:grid-cols-2">
    <!-- LEADERBOARD -->
    <Card.Root class="overflow-hidden border-0 shadow-sm ring-1 ring-border">
      <Card.Header class="border-b bg-muted/30 pb-4">
        <Card.Title class="flex items-center gap-2 text-lg">
          <Trophy class="h-5 w-5 text-yellow-500" />
          Top Talents (Leaderboard)
        </Card.Title>
        <Card.Description>
          Les prospects les plus engagés (XP) à contacter en priorité.
        </Card.Description>
      </Card.Header>
      <Card.Content class="p-0">
        <div class="divide-y">
          {#each data.topTalents as talent, index}
            <a
              href={resolve(`/staff/dev/students/${talent.id}`)}
              class="group flex items-center gap-4 p-4 transition-colors hover:bg-muted/30"
            >
              <div
                class="flex w-6 items-center justify-center font-heading text-xl text-muted-foreground group-hover:text-epi-blue"
              >
                {#if index < 3}
                  <Medal class={`h-6 w-6 ${getMedalColor(index)}`} />
                {:else}
                  {index + 1}
                {/if}
              </div>
              <Avatar.Root class="h-10 w-10 border shadow-sm">
                <Avatar.Fallback
                  class="bg-primary/10 text-xs font-bold text-primary"
                >
                  {talent.nom[0]}{talent.prenom[0]}
                </Avatar.Fallback>
              </Avatar.Root>
              <div class="min-w-0 flex-1">
                <p
                  class="flex items-center gap-2 truncate text-sm font-bold uppercase transition-colors group-hover:text-epi-blue"
                >
                  <span
                    >{talent.nom}
                    <span class="capitalize">{talent.prenom}</span></span
                  >
                  {#if talent.xp >= 100 && talent.lastActiveAt && (new Date().getTime() - new Date(talent.lastActiveAt).getTime()) / 86400000 <= 30}
                    <Flame class="h-3.5 w-3.5 text-epi-orange" />
                  {:else if talent.xp >= 100 && (!talent.lastActiveAt || (new Date().getTime() - new Date(talent.lastActiveAt).getTime()) / 86400000 >= 180)}
                    <Snowflake class="h-3.5 w-3.5 text-blue-400" />
                  {/if}
                </p>
                <p class="truncate text-xs text-muted-foreground">
                  {talent.niveau || 'Niveau inconnu'}
                </p>
              </div>
              <div class="text-right">
                <p class="text-lg font-black text-epi-orange italic">
                  {talent.xp}
                </p>
                <p
                  class="text-[9px] font-bold tracking-widest text-muted-foreground uppercase"
                >
                  XP
                </p>
              </div>
            </a>
          {:else}
            <div class="p-8 text-center text-sm text-muted-foreground">
              Le leaderboard est vide.
            </div>
          {/each}
        </div>
      </Card.Content>
      <Card.Footer class="border-t bg-muted/10 p-3">
        <Button
          variant="ghost"
          size="sm"
          class="w-full text-xs"
          href={resolve('/staff/dev/students')}
        >
          Ouvrir le CRM <ArrowRight class="ml-2 h-3 w-3" />
        </Button>
      </Card.Footer>
    </Card.Root>

    <!-- ÉVÉNEMENTS A VENIR + OBJECTIFS -->
    <div class="space-y-6">
      <Card.Root class="shadow-sm">
        <Card.Header>
          <Card.Title class="flex items-center gap-2 text-lg">
            <CalendarDays class="h-5 w-5 text-epi-teal" />
            Événements à venir
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-4">
          {#each data.upcomingEvents as event}
            <div
              class="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p class="text-sm font-bold uppercase">{event.titre}</p>
                <p
                  class="mt-1 flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <CalendarDays class="h-3 w-3" />
                  {new Date(event.date).toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    timeZone: data.timezone,
                  })}
                </p>
              </div>
              <div class="text-right">
                <Badge variant="secondary" class="font-mono"
                  >{event._count.participations} inscrits</Badge
                >
                <div class="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-7 text-xs"
                    href={resolve(`/staff/dev/events/${event.id}/manage`)}
                    >Gérer</Button
                  >
                </div>
              </div>
            </div>
          {:else}
            <p class="text-sm text-muted-foreground text-center py-4">
              Aucun événement prévu.
            </p>
          {/each}
        </Card.Content>
      </Card.Root>

      <Card.Root class="shadow-sm">
        <Card.Header>
          <Card.Title class="flex items-center gap-2 text-lg">
            <Target class="h-5 w-5 text-epi-teal" />
            Objectifs du mois
          </Card.Title>
        </Card.Header>
        <Card.Content class="space-y-6">
          <div class="space-y-2">
            <div class="flex justify-between text-sm font-bold">
              <span class="flex items-center gap-2">Entretiens menés</span>
              <span class="text-epi-blue"
                >{data.objectives.interviews}
                <span class="text-muted-foreground"
                  >/ {data.objectives.interviewsTarget}</span
                ></span
              >
            </div>
            <div class="h-3 overflow-hidden rounded-full bg-muted shadow-inner">
              <div
                class="h-full bg-linear-to-r from-epi-blue to-blue-400 transition-all duration-1000 ease-out"
                style="width: {(data.objectives.interviews /
                  data.objectives.interviewsTarget) *
                  100}%"
              ></div>
            </div>
          </div>
          <div class="space-y-2">
            <div class="flex justify-between text-sm font-bold">
              <span>Chartes signées (Stage)</span>
              <span class="text-epi-teal"
                >{data.objectives.chartes}
                <span class="text-muted-foreground"
                  >/ {data.objectives.totalParticipations}</span
                ></span
              >
            </div>
            <div class="h-3 overflow-hidden rounded-full bg-muted shadow-inner">
              <div
                class="h-full bg-linear-to-r from-epi-teal to-teal-400 transition-all duration-1000 ease-out"
                style="width: {data.objectives.totalParticipations
                  ? (data.objectives.chartes /
                      data.objectives.totalParticipations) *
                    100
                  : 0}%"
              ></div>
            </div>
          </div>
        </Card.Content>
      </Card.Root>
    </div>
  </div>
</div>
