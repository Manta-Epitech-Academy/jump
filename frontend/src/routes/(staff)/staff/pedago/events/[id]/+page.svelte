<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  import * as Card from '$lib/components/ui/card';
  import * as Avatar from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import {
    CalendarDays,
    ShieldHalf,
    LifeBuoy,
    RadioTower,
    Award,
    CalendarClock,
    UserPlus,
    StickyNote,
    ArrowRight,
    CircleCheck,
    UserCheck,
    Eye,
  } from '@lucide/svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import AssignMantasDialog from '$lib/components/events/AssignMantasDialog.svelte';
  import Gated from '$lib/components/auth/Gated.svelte';
  import { cn } from '$lib/utils';
  import { EVENT_TYPES } from '$lib/domain/event';

  let { data }: { data: PageData } = $props();

  let event = $derived(data.event);
  let readiness = $derived(data.readiness);
  let kpis = $derived(data.kpis);
  let status = $derived(data.status);

  let presentRatio = $derived(
    kpis.participantsCount > 0
      ? Math.round((kpis.presentCount / kpis.participantsCount) * 100)
      : 0,
  );

  let assignOpen = $state(false);

  function formatDateRange(start: Date, end: Date | null): string {
    const opts: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'long',
      timeZone: data.timezone,
    };
    const d1 = new Date(start).toLocaleDateString('fr-FR', opts);
    if (!end) return d1;
    const d2 = new Date(end).toLocaleDateString('fr-FR', opts);
    return d1 === d2 ? d1 : `${d1} – ${d2}`;
  }

  function getInitials(prenom: string, nom: string) {
    return ((nom?.[0] ?? '') + (prenom?.[0] ?? '')).toUpperCase();
  }

  let typeLabel = $derived(
    event.eventType === EVENT_TYPES.STAGE_SECONDE
      ? 'Stage de Seconde'
      : 'Coding Club',
  );

  let topTalents = $derived(
    [...data.participations]
      .sort((a, b) => (b.talent.xp ?? 0) - (a.talent.xp ?? 0))
      .slice(0, 6),
  );
</script>

<div class="space-y-6 pb-12">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/pedago') },
      { label: event.titre },
    ]}
  />

  <!-- HEADER -->
  <div
    class="flex flex-col gap-3 border-b pb-6 md:flex-row md:items-end md:justify-between"
  >
    <div class="space-y-2">
      <div
        class="flex flex-wrap items-center gap-2 text-xs font-bold tracking-widest uppercase"
      >
        <Badge
          variant="outline"
          class="border-epi-teal-solid text-epi-teal-solid"
        >
          {typeLabel}
        </Badge>
        {#if event.theme}
          <Badge variant="secondary">#{event.theme.nom}</Badge>
        {/if}
        {#if status.isLive}
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-epi-blue/10 px-2 py-0.5 text-epi-blue"
          >
            <span class="relative flex h-2 w-2">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-epi-blue opacity-75"
              ></span>
              <span
                class="relative inline-flex h-2 w-2 rounded-full bg-epi-blue"
              ></span>
            </span>
            En cours
          </span>
        {:else if status.isUpcoming}
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
          >
            <CalendarClock class="h-3 w-3" />
            À venir
          </span>
        {:else if status.isPast}
          <span
            class="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
          >
            <CircleCheck class="h-3 w-3" />
            Terminé
          </span>
        {/if}
      </div>
      <h1
        class="text-3xl font-bold text-epi-blue uppercase"
        style:view-transition-name={`event-title-${event.id}`}
      >
        {event.titre}<span class="text-epi-teal">_</span>
      </h1>
      <p
        class="flex items-center gap-2 text-sm font-bold tracking-wider text-muted-foreground uppercase"
      >
        <CalendarDays class="h-4 w-4" />
        {formatDateRange(event.date, event.endDate)}
      </p>
    </div>

    {#if status.isLive}
      <Button
        class="gap-2 bg-epi-blue text-white hover:bg-epi-blue/90"
        href={resolve(`/staff/pedago/events/${event.id}/presences`)}
      >
        <RadioTower class="h-4 w-4" />
        Cockpit Live
      </Button>
    {/if}
  </div>

  <!-- LIVE / KPIs (only when live or past) -->
  {#if status.isLive || (status.isPast && kpis.participantsCount > 0)}
    <Card.Root
      class="overflow-hidden border-t-4 {status.isLive
        ? 'border-t-epi-blue'
        : 'border-t-epi-teal-solid'} shadow-md"
    >
      <Card.Content
        class={cn(
          'grid gap-4 p-5 sm:grid-cols-2',
          status.isLive ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
        )}
      >
        <div class="flex items-center gap-3">
          <UserCheck class="h-8 w-8 text-epi-blue" />
          <div>
            <div class="text-2xl font-black">
              {kpis.presentCount}<span class="text-base text-muted-foreground"
                >/{kpis.participantsCount}</span
              >
            </div>
            <div
              class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
            >
              Présents · {presentRatio}%
            </div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <CalendarClock class="h-8 w-8 text-orange-500" />
          <div>
            <div
              class="text-2xl font-black {kpis.lateCount > 0
                ? 'text-orange-500'
                : 'text-muted-foreground'}"
            >
              {kpis.lateCount}
            </div>
            <div
              class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
            >
              Retards
            </div>
          </div>
        </div>
        {#if status.isLive}
          <div class="flex items-center gap-3">
            <LifeBuoy
              class={cn(
                'h-8 w-8',
                kpis.activeAlertsCount > 0
                  ? 'animate-pulse text-epi-orange'
                  : 'text-muted-foreground',
              )}
            />
            <div>
              <div
                class="text-2xl font-black {kpis.activeAlertsCount > 0
                  ? 'text-epi-orange'
                  : 'text-muted-foreground'}"
              >
                {kpis.activeAlertsCount}
              </div>
              <div
                class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
              >
                Alertes Manta
              </div>
            </div>
          </div>
          {#if event.pin}
            <div
              class="flex items-center gap-3 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/30 dark:bg-amber-950/20"
            >
              <span
                class="font-mono text-2xl font-black text-amber-600 dark:text-amber-400"
                >{event.pin}</span
              >
              <span
                class="text-[10px] font-bold tracking-widest text-amber-700/70 uppercase dark:text-amber-500/80"
                >PIN<br />Session</span
              >
            </div>
          {/if}
        {:else if status.isPast}
          <Button
            variant="outline"
            href={resolve(`/staff/pedago/events/${event.id}/certificates`)}
            class="gap-2 self-center"
          >
            <Award class="h-4 w-4" />
            Diplômes
          </Button>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}

  <div class="grid gap-6 lg:grid-cols-3">
    <!-- READINESS / NOTES (left col, 2/3 on lg) -->
    <div class="space-y-6 lg:col-span-2">
      {#if !status.isPast}
        <section>
          <div
            class="mb-3 text-sm font-bold tracking-widest text-muted-foreground uppercase"
          >
            Préparation pédago
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <Card.Root class="rounded-sm">
              <Card.Content class="flex items-start gap-3 p-4">
                <CalendarDays
                  class="mt-0.5 h-5 w-5 shrink-0 {readiness.hasPlanning
                    ? 'text-epi-teal-solid'
                    : 'text-yellow-500'}"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-bold uppercase">Planning</div>
                  {#if !readiness.hasPlanning}
                    <p
                      class="mt-1 text-xs text-yellow-600 dark:text-yellow-400"
                    >
                      Pas encore construit
                    </p>
                  {:else if readiness.unassignedSlotsCount > 0}
                    <p
                      class="mt-1 text-xs text-yellow-600 dark:text-yellow-400"
                    >
                      {readiness.unassignedSlotsCount} créneau{readiness.unassignedSlotsCount >
                      1
                        ? 'x'
                        : ''} sans activité
                    </p>
                  {:else}
                    <p class="mt-1 text-xs text-muted-foreground">
                      {readiness.totalSlots} créneau{readiness.totalSlots > 1
                        ? 'x'
                        : ''} · {readiness.orgaSlotsCount} appel{readiness.orgaSlotsCount >
                      1
                        ? 's'
                        : ''}
                    </p>
                  {/if}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  href={resolve(`/staff/pedago/events/${event.id}/planning`)}
                  class="shrink-0 gap-1 text-xs"
                >
                  Ouvrir <ArrowRight class="h-3 w-3" />
                </Button>
              </Card.Content>
            </Card.Root>

            <Card.Root class="rounded-sm">
              <Card.Content class="flex items-start gap-3 p-4">
                <ShieldHalf
                  class="mt-0.5 h-5 w-5 shrink-0 {readiness.hasMantas
                    ? 'text-epi-teal-solid'
                    : 'text-yellow-500'}"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-bold uppercase">Mantas</div>
                  {#if readiness.hasMantas}
                    <p class="mt-1 text-xs text-muted-foreground">
                      {readiness.mantasCount} assigné{readiness.mantasCount > 1
                        ? 's'
                        : ''}
                    </p>
                  {:else}
                    <p
                      class="mt-1 text-xs text-yellow-600 dark:text-yellow-400"
                    >
                      Aucun manta assigné
                    </p>
                  {/if}
                </div>
                <Gated group="leads">
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => (assignOpen = true)}
                    class="shrink-0 gap-1 text-xs"
                  >
                    <UserPlus class="h-3 w-3" />
                    {readiness.hasMantas ? 'Modifier' : 'Assigner'}
                  </Button>
                </Gated>
              </Card.Content>
            </Card.Root>
          </div>
        </section>
      {/if}

      {#if event.notes}
        <section>
          <div
            class="mb-3 flex items-center gap-2 text-sm font-bold tracking-widest text-muted-foreground uppercase"
          >
            <StickyNote class="h-4 w-4" /> Notes pédago
          </div>
          <div
            class="rounded-sm border border-blue-200 bg-blue-50 p-4 text-sm whitespace-pre-wrap text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200"
          >
            {event.notes}
          </div>
        </section>
      {/if}

      <section>
        <div class="mb-3 flex items-baseline justify-between">
          <div
            class="text-sm font-bold tracking-widest text-muted-foreground uppercase"
          >
            Inscrits — top XP
          </div>
          <Button
            variant="link"
            size="sm"
            href={resolve(`/staff/pedago/events/${event.id}/inscrits`)}
            class="text-xs"
          >
            Voir tous les inscrits <ArrowRight class="ml-1 h-3 w-3" />
          </Button>
        </div>
        {#if topTalents.length === 0}
          <div
            class="rounded-sm border border-dashed border-border bg-muted/10 py-8 text-center text-sm text-muted-foreground"
          >
            Aucun inscrit pour l'instant.
          </div>
        {:else}
          <div class="grid gap-2 sm:grid-cols-2">
            {#each topTalents as p (p.id)}
              <a
                href={resolve(`/staff/pedago/students/${p.talent.id}`)}
                class="flex items-center gap-3 rounded-sm border bg-card p-3 transition-colors hover:border-epi-blue/50"
              >
                <span
                  class="block rounded-full"
                  style:view-transition-name={`student-avatar-${p.talent.id}`}
                >
                  <Avatar.Root class="h-10 w-10 border-2 border-muted">
                    <Avatar.Fallback class="bg-muted text-xs font-bold">
                      {getInitials(p.talent.prenom, p.talent.nom)}
                    </Avatar.Fallback>
                  </Avatar.Root>
                </span>
                <div class="min-w-0 flex-1">
                  <div
                    class="truncate text-sm font-bold tracking-tight uppercase"
                  >
                    {p.talent.nom}
                    <span class="capitalize">{p.talent.prenom}</span>
                  </div>
                  <div
                    class="mt-0.5 flex items-center gap-2 text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
                  >
                    {#if p.talent.niveau}<span>{p.talent.niveau}</span>{/if}
                    {#if p.talent.eventsCount > 0}
                      <span class="opacity-30">·</span>
                      <span
                        >{p.talent.eventsCount} événement{p.talent.eventsCount >
                        1
                          ? 's'
                          : ''}</span
                      >
                    {/if}
                    <span class="opacity-30">·</span>
                    <span class="text-epi-orange">{p.talent.xp} XP</span>
                  </div>
                </div>
              </a>
            {/each}
          </div>
        {/if}
      </section>
    </div>

    <!-- RIGHT SIDEBAR -->
    <aside class="space-y-6">
      <!-- Mantas list -->
      <section>
        <div
          class="mb-3 flex items-center gap-2 text-sm font-bold tracking-widest text-muted-foreground uppercase"
        >
          <ShieldHalf class="h-4 w-4" /> Équipe Manta
        </div>
        {#if event.mantas.length === 0}
          <div
            class="rounded-sm border border-dashed border-border bg-muted/10 py-6 text-center text-sm text-muted-foreground"
          >
            Aucun manta assigné.
          </div>
        {:else}
          <ul class="space-y-2">
            {#each event.mantas as m (m.staffProfileId)}
              <li
                class="flex items-center gap-3 rounded-sm border bg-card p-2.5"
              >
                <Avatar.Root class="h-8 w-8">
                  <Avatar.Fallback class="bg-muted text-[10px] font-bold">
                    {(m.staffProfile.user.name ?? '??')
                      .slice(0, 2)
                      .toUpperCase()}
                  </Avatar.Fallback>
                </Avatar.Root>
                <span class="truncate text-sm font-medium"
                  >{m.staffProfile.user.name}</span
                >
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- Quick links — only routes the hub doesn't preview inline -->
      <section>
        <div
          class="mb-3 text-sm font-bold tracking-widest text-muted-foreground uppercase"
        >
          Naviguer
        </div>
        <div class="space-y-2">
          <a
            href={resolve(`/staff/pedago/events/${event.id}/presences`)}
            class="flex items-center justify-between rounded-sm border bg-card p-3 transition-colors hover:border-epi-blue/50"
          >
            <span class="flex items-center gap-2 text-sm font-bold uppercase">
              <RadioTower class="h-4 w-4 text-muted-foreground" /> Présences
            </span>
            <ArrowRight class="h-4 w-4 text-muted-foreground" />
          </a>
          <a
            href={resolve(`/staff/pedago/events/${event.id}/factions`)}
            class="flex items-center justify-between rounded-sm border bg-card p-3 transition-colors hover:border-epi-blue/50"
          >
            <span class="flex items-center gap-2 text-sm font-bold uppercase">
              <ShieldHalf class="h-4 w-4 text-muted-foreground" /> Factions
            </span>
            <ArrowRight class="h-4 w-4 text-muted-foreground" />
          </a>
          <a
            href={resolve(`/staff/pedago/events/${event.id}/validation`)}
            class="flex items-center justify-between rounded-sm border bg-card p-3 transition-colors hover:border-epi-blue/50"
          >
            <span class="flex items-center gap-2 text-sm font-bold uppercase">
              <Eye class="h-4 w-4 text-muted-foreground" /> Validation
            </span>
            <ArrowRight class="h-4 w-4 text-muted-foreground" />
          </a>
        </div>
      </section>
    </aside>
  </div>
</div>

<AssignMantasDialog
  bind:open={assignOpen}
  eventId={event.id}
  eventTitle={event.titre}
  mantas={data.campusMantas}
  currentMantaIds={event.mantas.map((m) => m.staffProfileId)}
/>
