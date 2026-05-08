<script lang="ts">
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Tag from '@lucide/svelte/icons/tag';
  import Users from '@lucide/svelte/icons/users';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import Laptop from '@lucide/svelte/icons/laptop';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import { buttonVariants } from '$lib/components/ui/button';
  import AlertsPanel from '$lib/components/staff/AlertsPanel.svelte';
  import type { EventAlert } from '$lib/server/services/eventTasks';
  import EventKpiTile from './EventKpiTile.svelte';
  import EventNotesCard from './EventNotesCard.svelte';
  import { resolve } from '$app/paths';

  type Props = {
    eventId: string;
    titre: string;
    date: Date;
    endDate: Date | null;
    notes: string | null;
    timezone: string;
    themeName?: string | null;
    mantasCount: number;
    stats: {
      total: number;
      bringPc: number;
    };
    alerts: EventAlert[];
    onEditNotes: () => void;
  };

  let {
    eventId,
    titre,
    date,
    endDate,
    notes,
    timezone,
    themeName,
    mantasCount,
    stats,
    alerts,
    onEditNotes,
  }: Props = $props();

  const dateLabel = $derived(() => {
    const start = date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    });
    if (!endDate) return start;
    const end = endDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    });
    return `${start} → ${end}`;
  });
</script>

<div class="space-y-6 pb-12">
  <PageHero>
    <div
      class="flex flex-wrap items-center gap-3 font-mono text-[10px] font-bold tracking-widest text-blue-100 uppercase"
    >
      <span class="inline-flex items-center gap-1.5">
        <CalendarDays class="h-3.5 w-3.5" />
        {dateLabel()}
      </span>
      {#if themeName}
        <span class="inline-flex items-center gap-1.5 text-epi-teal">
          <Tag class="h-3.5 w-3.5" />
          {themeName}
        </span>
      {/if}
    </div>
    <h1 class="mt-3 font-heading text-4xl tracking-wide uppercase">
      {titre}<span class="text-epi-teal">_</span>
    </h1>
    <p class="mt-5 max-w-2xl text-sm leading-relaxed font-medium text-blue-100">
      Vue d’ensemble de l’événement. Vous y retrouvez la cohorte inscrite, ce
      qu’il reste à préparer, et les raccourcis vers le planning et l’équipe.
    </p>
  </PageHero>

  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <EventKpiTile
      label="Inscrits"
      value={stats.total}
      icon={Users}
      tone="blue"
      href={resolve(`/staff/dev/events/${eventId}/inscrits`)}
    />
    <EventKpiTile
      label="PC à préparer"
      value={stats.total - stats.bringPc}
      icon={Laptop}
      tone="orange"
    />
    <EventKpiTile
      label="Intervenants"
      value={mantasCount}
      icon={GraduationCap}
      tone="teal"
      href={resolve(`/staff/dev/events/${eventId}/team`)}
    />
  </div>

  <div class="flex flex-wrap gap-2">
    <a
      href={resolve(`/staff/dev/events/${eventId}/inscrits`)}
      class={buttonVariants({ variant: 'outline', class: 'rounded-sm' })}
    >
      <Users class="mr-2 h-4 w-4" /> Inscrits
    </a>
    <a
      href={resolve(`/staff/dev/events/${eventId}/planning`)}
      class={buttonVariants({ variant: 'outline', class: 'rounded-sm' })}
    >
      <CalendarDays class="mr-2 h-4 w-4" /> Planning
    </a>
    <a
      href={resolve(`/staff/dev/events/${eventId}/team`)}
      class={buttonVariants({ variant: 'outline', class: 'rounded-sm' })}
    >
      <GraduationCap class="mr-2 h-4 w-4" /> Équipe
    </a>
  </div>

  <section class="space-y-3">
    <h2
      class="font-sans text-base font-bold tracking-wide text-foreground uppercase"
    >
      À traiter
    </h2>
    <AlertsPanel {alerts} />
  </section>

  <EventNotesCard {notes} onEdit={onEditNotes} defaultOpen />
</div>
