<script lang="ts">
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import AlertsPanel from '$lib/components/staff/AlertsPanel.svelte';
  import type { EventAlert } from '$lib/server/services/eventTasks';
  import { activityTypes } from '$lib/validation/templates';
  import CountdownHero from './CountdownHero.svelte';
  import EventKpiTile from './EventKpiTile.svelte';
  import ProgrammeJour from './ProgrammeJour.svelte';
  import LyceesBreakdown from './LyceesBreakdown.svelte';
  import InterestsCloud from './InterestsCloud.svelte';
  import EventNotesCard from './EventNotesCard.svelte';

  type ActivityTypeKey = (typeof activityTypes)[number];

  type Props = {
    eventId: string;
    titre: string;
    notes: string | null;
    daysToStart: number;
    openDate: Date;
    timezone: string;
    kpis: {
      total: number;
      comptesActives: number;
      profilComplete: number;
      dossiersAdmin: number;
    };
    alerts: EventAlert[];
    firstDayTimeSlots: {
      id: string;
      startTime: Date | string;
      endTime: Date | string;
      activity: {
        id: string;
        nom: string;
        activityType: ActivityTypeKey;
        activityThemes: { theme: { nom: string } }[];
      } | null;
    }[];
    lyceesBreakdown: { lyceeId: string; nom: string; count: number }[];
    interestsCloud: { interestId: string; label: string; count: number }[];
    onEditNotes: () => void;
  };

  let {
    eventId,
    titre,
    notes,
    daysToStart,
    openDate,
    timezone,
    kpis,
    alerts,
    firstDayTimeSlots,
    lyceesBreakdown,
    interestsCloud,
    onEditNotes,
  }: Props = $props();

  const hasOriginsData = $derived(
    lyceesBreakdown.length > 0 || interestsCloud.length > 0,
  );

  const pct = (n: number) =>
    kpis.total === 0 ? 0 : Math.round((n / kpis.total) * 100);
</script>

<div class="space-y-6 pb-12">
  <CountdownHero {titre} {daysToStart} {openDate} {timezone} />

  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <EventKpiTile
      label="Inscrits"
      value={kpis.total}
      sub="cohorte confirmée"
      icon={UserPlus}
      tone="blue"
    />
    <EventKpiTile
      label="Comptes activés"
      value={kpis.comptesActives}
      sub={`${pct(kpis.comptesActives)} % · ${kpis.total - kpis.comptesActives} à relancer`}
      icon={KeyRound}
      tone="teal"
      progress={pct(kpis.comptesActives)}
    />
    <EventKpiTile
      label="Profil complété"
      value={kpis.profilComplete}
      sub={`${pct(kpis.profilComplete)} % · onboarding plateforme`}
      icon={UserCheck}
      tone="pink"
      progress={pct(kpis.profilComplete)}
    />
    <EventKpiTile
      label="Dossiers admin OK"
      value={kpis.dossiersAdmin}
      sub={`${pct(kpis.dossiersAdmin)} % · 4 documents validés`}
      icon={ClipboardCheck}
      tone="orange"
      progress={pct(kpis.dossiersAdmin)}
    />
  </div>

  <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
    <ProgrammeJour
      {eventId}
      timeSlots={firstDayTimeSlots}
      {timezone}
      title="Programme du J1"
      emptyLabel="Aucun créneau publié pour le J1. Préparez le planning d’ouverture."
    />
    <section class="space-y-3">
      <h2
        class="font-sans text-base font-bold tracking-wide text-foreground uppercase"
      >
        À traiter
      </h2>
      <AlertsPanel {alerts} layout="list" emptyLabel="Préparation à jour." />
    </section>
  </div>

  {#if hasOriginsData}
    <div class="grid gap-4 lg:grid-cols-2">
      <LyceesBreakdown
        lycees={lyceesBreakdown}
        totalParticipations={kpis.total}
      />
      <InterestsCloud interests={interestsCloud} />
    </div>
  {/if}

  <EventNotesCard {notes} onEdit={onEditNotes} />
</div>
