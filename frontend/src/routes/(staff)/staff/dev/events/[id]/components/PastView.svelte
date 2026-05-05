<script lang="ts">
  import Users from '@lucide/svelte/icons/users';
  import Laptop from '@lucide/svelte/icons/laptop';
  import FileText from '@lucide/svelte/icons/file-text';
  import ScrollText from '@lucide/svelte/icons/scroll-text';
  import Camera from '@lucide/svelte/icons/camera';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import History from '@lucide/svelte/icons/history';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import EventKpiTile from './EventKpiTile.svelte';
  import EventNotesCard from './EventNotesCard.svelte';

  type Props = {
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
    titre,
    notes,
    startDate,
    endDate,
    timezone,
    stats,
    onEditNotes,
  }: Props = $props();

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
  <PageHero variant="amber" decorationIcon={History}>
    <p
      class="font-mono text-[10px] font-bold tracking-widest text-orange-100 uppercase"
    >
      Stage terminé · {datesLabel}
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
    />
    <EventKpiTile
      label="PC apportés"
      value={`${stats.bringPc} / ${stats.total}`}
      icon={Laptop}
      tone="neutral"
    />
    <EventKpiTile
      label="Entretiens menés"
      value={`${stats.interviewsCompleted} / ${stats.total}`}
      icon={MessageSquare}
      tone="neutral"
    />
    <EventKpiTile
      label="Chartes signées"
      value={`${stats.chartes} / ${stats.total}`}
      icon={FileText}
      tone="neutral"
    />
    <EventKpiTile
      label="Conventions signées"
      value={`${stats.conventions} / ${stats.total}`}
      icon={ScrollText}
      tone="neutral"
    />
    <EventKpiTile
      label="Droits à l’image"
      value={`${stats.droitsImage} / ${stats.total}`}
      icon={Camera}
      tone="neutral"
    />
  </div>

  <EventNotesCard {notes} onEdit={onEditNotes} defaultOpen />
</div>
