<script lang="ts">
  import Users from '@lucide/svelte/icons/users';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import { resolve } from '$app/paths';
  import AlertsPanel from '$lib/components/staff/AlertsPanel.svelte';
  import type { EventAlert } from '$lib/server/services/eventTasks';
  import { activityTypes } from '$lib/validation/templates';
  import OngoingHero from './OngoingHero.svelte';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import KpiCelebration from '$lib/components/staff/KpiCelebration.svelte';
  import ProgrammeJour from './ProgrammeJour.svelte';
  import MesProchainsEntretiens from './MesProchainsEntretiens.svelte';
  import EventNotesCard from './EventNotesCard.svelte';
  import LyceesBreakdown from './LyceesBreakdown.svelte';
  import InterestsCloud from './InterestsCloud.svelte';

  type ActivityTypeKey = (typeof activityTypes)[number];

  type Props = {
    eventId: string;
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
    lyceesBreakdown: {
      rows: { highSchoolName: string; count: number }[];
      others: { count: number; categories: number } | null;
    };
    interestsCloud: {
      rows: {
        interestId: string;
        nom: string;
        emoji: string | null;
        count: number;
      }[];
      others: { count: number; categories: number } | null;
    };
    showPlanning: boolean;
    onEditNotes: () => void;
  };

  let {
    eventId,
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
    lyceesBreakdown,
    interestsCloud,
    showPlanning,
    onEditNotes,
  }: Props = $props();

  const hasOriginsData = $derived(
    lyceesBreakdown.rows.length > 0 || interestsCloud.rows.length > 0,
  );

  const interviewsPct = $derived(
    kpis.interviewsTotal === 0
      ? 0
      : Math.round((kpis.interviewsCompleted / kpis.interviewsTotal) * 100),
  );

  const presencePctRounded = $derived(
    kpis.todayPresence && kpis.todayPresence.total > 0
      ? Math.round(
          (kpis.todayPresence.present / kpis.todayPresence.total) * 100,
        )
      : 0,
  );

  const inscritsHref = $derived(
    resolve(`/staff/dev/events/${eventId}/inscrits`),
  );
  const interviewsHref = $derived(
    resolve(`/staff/dev/events/${eventId}/interviews`),
  );

  const is100Interviews = $derived(
    kpis.interviewsTotal > 0 &&
      kpis.interviewsCompleted === kpis.interviewsTotal,
  );
</script>

<div class="animate-in space-y-6 pb-12 duration-300 fade-in">
  <OngoingHero {dayN} {totalDays} {startDate} {endDate} {timezone} />

  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <KpiTile
      label="Inscrits"
      value={kpis.total}
      sub="cohorte confirmée"
      icon={Users}
      tone="blue"
      href={inscritsHref}
    />

    {#if kpis.todayPresence}
      {@const present = kpis.todayPresence.present}
      {@const totalPresence = kpis.todayPresence.total}
      {@const is100Presence = totalPresence > 0 && present === totalPresence}
      <KpiCelebration active={is100Presence} tone="teal" badgeIcon={UserCheck}>
        <KpiTile
          label="Présents au dernier appel"
          icon={UserCheck}
          tone="teal"
          progress={presencePctRounded}
          sub={is100Presence
            ? `${kpis.todayPresence.slotName} · Classe complète`
            : `${kpis.todayPresence.slotName} · ${presencePctRounded} %`}
        >
          {#snippet valueSnippet()}
            <p class="font-heading text-5xl tracking-wide text-epi-teal-solid">
              {present}
              <span class="text-2xl text-muted-foreground"
                >/ {totalPresence}</span
              >
            </p>
          {/snippet}
        </KpiTile>
      </KpiCelebration>
    {:else}
      <KpiTile
        label="Présents aujourd’hui"
        value="—"
        sub="aucun appel terminé"
        icon={UserCheck}
        tone="neutral"
      />
    {/if}

    <KpiCelebration
      active={is100Interviews}
      tone="pink"
      badgeIcon={CheckCircle2}
    >
      <KpiTile
        label="Entretiens"
        icon={MessageSquare}
        tone="pink"
        progress={interviewsPct}
        sub={is100Interviews
          ? `Tous les entretiens sont menés`
          : `${interviewsPct} % · ${kpis.interviewsCompleted} terminés`}
        href={interviewsHref}
      >
        {#snippet valueSnippet()}
          <p class="font-heading text-5xl tracking-wide text-epi-pink">
            {kpis.interviewsCompleted}
            <span class="text-2xl text-muted-foreground"
              >/ {kpis.interviewsTotal}</span
            >
          </p>
        {/snippet}
      </KpiTile>
    </KpiCelebration>
  </div>

  <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
    <section class="space-y-2">
      <h2 class="font-heading text-2xl tracking-wide text-foreground uppercase">
        Alertes
      </h2>
      <p
        class="font-mono text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
      >
        Dérivées d’Onboarding, Salesforce et l’activité plateforme
      </p>
      <div class="pt-2">
        {#if alerts.length === 0}
          <div
            class="flex animate-in flex-col items-center justify-center rounded-sm border border-epi-teal-solid/30 bg-epi-teal-solid/5 p-8 text-center duration-300 fade-in"
          >
            <div
              class="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-epi-teal-solid/15"
            >
              <CheckCircle2 class="h-8 w-8 text-epi-teal-solid" />
              <Sparkles
                class="absolute top-0 -right-1 h-5 w-5 text-epi-orange"
              />
            </div>
            <h3
              class="text-sm font-bold tracking-widest text-epi-teal-solid uppercase"
            >
              Zéro alerte<span class="text-epi-teal">_</span>
            </h3>
            <p class="mt-1 text-xs text-muted-foreground">
              Tout est sous contrôle, beau travail.
            </p>
          </div>
        {:else}
          <AlertsPanel
            {alerts}
            layout="list"
            emptyLabel="Tout est sous contrôle."
          />
        {/if}
      </div>
    </section>
    <div class="flex flex-col gap-4">
      <ProgrammeJour
        {eventId}
        {timeSlots}
        {timezone}
        showPlanningLink={showPlanning}
      />
      <MesProchainsEntretiens
        {eventId}
        interviews={mesProchainsEntretiens}
        {timezone}
      />
    </div>
  </div>

  {#if hasOriginsData}
    <div class="grid gap-4 lg:grid-cols-2">
      <LyceesBreakdown
        {eventId}
        breakdown={lyceesBreakdown}
        totalParticipations={kpis.total}
      />
      <InterestsCloud
        {eventId}
        breakdown={interestsCloud}
        totalParticipations={kpis.total}
      />
    </div>
  {/if}

  <EventNotesCard {notes} onEdit={onEditNotes} />
</div>
