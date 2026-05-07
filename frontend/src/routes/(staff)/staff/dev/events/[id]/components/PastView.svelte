<script lang="ts">
  import Users from '@lucide/svelte/icons/users';
  import Laptop from '@lucide/svelte/icons/laptop';
  import FileText from '@lucide/svelte/icons/file-text';
  import ScrollText from '@lucide/svelte/icons/scroll-text';
  import Camera from '@lucide/svelte/icons/camera';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import { resolve } from '$app/paths';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import EventKpiTile from './EventKpiTile.svelte';
  import EventNotesCard from './EventNotesCard.svelte';

  type Props = {
    eventId: string;
    titre: string;
    notes: string | null;
    startDate: Date;
    endDate: Date;
    timezone: string;
    stats: {
      total: number;
      bringPc: number;
      chartes: number;
      conventions: number;
      droitsImage: number;
      interviewsCompleted: number;
    };
    onEditNotes: () => void;
  };

  let {
    eventId,
    titre,
    notes,
    startDate,
    endDate,
    timezone,
    stats,
    onEditNotes,
  }: Props = $props();

  const inscritsHref = $derived(
    resolve(`/staff/dev/events/${eventId}/inscrits`),
  );
  const interviewsHref = $derived(
    resolve(`/staff/dev/events/${eventId}/interviews`),
  );
  const onboardingHref = $derived(
    resolve(`/staff/dev/events/${eventId}/onboarding`),
  );

  const datesLabel = $derived(
    `${startDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      timeZone: timezone,
    })} → ${endDate.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: timezone,
    })}`,
  );
</script>

<div class="space-y-6 pb-12">
  <PageHero variant="amber">
    <p
      class="font-mono text-[10px] font-bold tracking-widest text-orange-100 uppercase"
    >
      <span class="opacity-60">&lt;</span> Stage terminé · {datesLabel}
      <span class="opacity-60">/&gt;</span>
    </p>
    <h1 class="mt-3 font-heading text-4xl tracking-wide uppercase">
      {titre}<span class="text-epi-teal">_</span>
    </h1>
    <p class="mt-2 text-sm text-orange-100">
      {stats.total} inscrits · {stats.interviewsCompleted} entretiens menés
    </p>
    <p
      class="mt-5 max-w-2xl text-sm leading-relaxed font-medium text-orange-100"
    >
      Le stage est clos. Cette page garde la photographie finale — qui était
      inscrit, ce qui a été signé, combien d’entretiens ont été menés. Les
      alertes et les actions du jour sont désactivées : on est en mode bilan.
    </p>
  </PageHero>

  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <EventKpiTile
      label="Inscrits"
      value={stats.total}
      icon={Users}
      tone="neutral"
      href={inscritsHref}
    />
    <EventKpiTile
      label="PC à préparer"
      value={stats.total - stats.bringPc}
      icon={Laptop}
      tone="neutral"
      href={onboardingHref}
    />
    <EventKpiTile
      label="Entretiens menés"
      value={`${stats.interviewsCompleted} / ${stats.total}`}
      icon={MessageSquare}
      tone="neutral"
      href={interviewsHref}
    />
    <EventKpiTile
      label="Chartes signées"
      value={`${stats.chartes} / ${stats.total}`}
      icon={FileText}
      tone="neutral"
      href={onboardingHref}
    />
    <EventKpiTile
      label="Conventions signées"
      value={`${stats.conventions} / ${stats.total}`}
      icon={ScrollText}
      tone="neutral"
      href={onboardingHref}
    />
    <EventKpiTile
      label="Droits à l’image"
      value={`${stats.droitsImage} / ${stats.total}`}
      icon={Camera}
      tone="neutral"
      href={onboardingHref}
    />
  </div>

  <EventNotesCard {notes} onEdit={onEditNotes} defaultOpen />
</div>
