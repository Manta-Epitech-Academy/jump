<script lang="ts">
  import Users from '@lucide/svelte/icons/users';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import AlertsPanel from '$lib/components/staff/AlertsPanel.svelte';
  import type { EventAlert } from '$lib/server/services/eventTasks';
  import { activityTypes } from '$lib/validation/templates';
  import OngoingHero from './OngoingHero.svelte';
  import EventKpiTile from './EventKpiTile.svelte';
  import ProgrammeJour from './ProgrammeJour.svelte';
  import MesProchainsEntretiens from './MesProchainsEntretiens.svelte';
  import EventNotesCard from './EventNotesCard.svelte';

  type ActivityTypeKey = (typeof activityTypes)[number];

  type Props = {
    eventId: string;
    titre: string;
    notes: string | null;
    dayN: number;
    totalDays: number;
    startDate: Date;
    endDate: Date;
    timezone: string;
    kpis: {
      total: number;
      interviewsCompleted: number;
      interviewsTotal: number;
      conformitePct: number;
      todayPresence: {
        slotName: string;
        present: number;
        total: number;
      } | null;
    };
    alerts: EventAlert[];
    timeSlots: {
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
    mesProchainsEntretiens: {
      id: string;
      date: Date | string;
      talent: { id: string; nom: string; prenom: string };
    }[];
    onEditNotes: () => void;
  };

  let {
    eventId,
    titre,
    notes,
    dayN,
    totalDays,
    startDate,
    endDate,
    timezone,
    kpis,
    alerts,
    timeSlots,
    mesProchainsEntretiens,
    onEditNotes,
  }: Props = $props();

  const interviewsPct = $derived(
    kpis.interviewsTotal === 0
      ? 0
      : Math.round((kpis.interviewsCompleted / kpis.interviewsTotal) * 100),
  );

  const conformitePctRounded = $derived(Math.round(kpis.conformitePct * 100));

  const presencePctRounded = $derived(
    kpis.todayPresence && kpis.todayPresence.total > 0
      ? Math.round(
          (kpis.todayPresence.present / kpis.todayPresence.total) * 100,
        )
      : 0,
  );
</script>

<div class="space-y-6 pb-12">
  <OngoingHero {titre} {dayN} {totalDays} {startDate} {endDate} {timezone} />

  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <EventKpiTile
      label="Inscrits"
      value={kpis.total}
      sub="cohorte confirmée"
      icon={Users}
      tone="blue"
    />
    {#if kpis.todayPresence}
      {@const present = kpis.todayPresence.present}
      {@const totalPresence = kpis.todayPresence.total}
      <EventKpiTile
        label="Présents au dernier appel"
        icon={UserCheck}
        tone="teal"
        progress={presencePctRounded}
        sub={`${kpis.todayPresence.slotName} · ${presencePctRounded} %`}
      >
        {#snippet valueSnippet()}
          <p class="text-3xl font-black text-foreground">
            {present}
            <span class="text-base text-muted-foreground"
              >/ {totalPresence}</span
            >
          </p>
        {/snippet}
      </EventKpiTile>
    {:else}
      <EventKpiTile
        label="Présents aujourd’hui"
        value="—"
        sub="aucun appel terminé"
        icon={UserCheck}
        tone="neutral"
      />
    {/if}
    <EventKpiTile
      label="Entretiens"
      icon={MessageSquare}
      tone="pink"
      progress={interviewsPct}
      sub={`${interviewsPct} % · ${kpis.interviewsCompleted} terminés`}
    >
      {#snippet valueSnippet()}
        <p class="text-3xl font-black text-foreground">
          {kpis.interviewsCompleted}
          <span class="text-base text-muted-foreground"
            >/ {kpis.interviewsTotal}</span
          >
        </p>
      {/snippet}
    </EventKpiTile>
    <EventKpiTile
      label="Conformité ADM"
      value={`${conformitePctRounded} %`}
      sub="moyenne sur 4 documents"
      icon={ShieldCheck}
      tone="orange"
      progress={conformitePctRounded}
    />
  </div>

  <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
    <ProgrammeJour {eventId} {timeSlots} {timezone} />
    <div class="flex flex-col gap-4">
      <section class="space-y-3">
        <h2
          class="font-sans text-base font-bold tracking-wide text-foreground uppercase"
        >
          Alertes
        </h2>
        <AlertsPanel
          {alerts}
          layout="list"
          emptyLabel="Tout est sous contrôle."
        />
      </section>
      <MesProchainsEntretiens
        {eventId}
        interviews={mesProchainsEntretiens}
        {timezone}
      />
    </div>
  </div>

  <EventNotesCard {notes} onEdit={onEditNotes} />
</div>
