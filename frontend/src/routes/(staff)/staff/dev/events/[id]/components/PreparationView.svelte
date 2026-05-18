<script lang="ts">
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import { resolve } from '$app/paths';
  import ChecklistPanel from '$lib/components/staff/ChecklistPanel.svelte';
  import type { ChecklistItem } from '$lib/server/services/eventTasks';
  import { activityTypes } from '$lib/validation/templates';
  import CountdownHero from './CountdownHero.svelte';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import ProgrammeJour from './ProgrammeJour.svelte';
  import LyceesBreakdown from './LyceesBreakdown.svelte';
  import InterestsCloud from './InterestsCloud.svelte';
  import EventNotesCard from './EventNotesCard.svelte';
  import TalentJourneyExplainer from '$lib/components/dev/TalentJourneyExplainer.svelte';

  type ActivityTypeKey = (typeof activityTypes)[number];

  type Props = {
    eventId: string;
    notes: string | null;
    daysToStart: number;
    openDate: Date;
    timezone: string;
    kpis: {
      total: number;
      dossiersAdmin: number;
    };
    checklist: ChecklistItem[];
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
    daysToStart,
    openDate,
    timezone,
    kpis,
    checklist,
    firstDayTimeSlots,
    lyceesBreakdown,
    interestsCloud,
    showPlanning,
    onEditNotes,
  }: Props = $props();

  const hasOriginsData = $derived(
    lyceesBreakdown.rows.length > 0 || interestsCloud.rows.length > 0,
  );

  const pct = (n: number) =>
    kpis.total === 0 ? 0 : Math.round((n / kpis.total) * 100);

  const inscritsHref = $derived(
    resolve(`/staff/dev/events/${eventId}/inscrits`),
  );
  const onboardingHref = $derived(
    resolve(`/staff/dev/events/${eventId}/onboarding`),
  );
</script>

<div class="space-y-6 pb-12">
  <CountdownHero {daysToStart} {openDate} {timezone} />

  <TalentJourneyExplainer />

  <div class="grid gap-3 sm:grid-cols-2">
    <KpiTile
      label="Inscrits"
      helpText="Talents inscrits à ce stage (synchro automatique Salesforce). Un compte personnel Jump leur est automatiquement créé."
      value={kpis.total}
      sub="cohorte confirmée"
      icon={UserPlus}
      tone="blue"
      href={inscritsHref}
    />
    <KpiTile
      label="Dossiers administratifs validés"
      helpText="Talents pour qui les 2 documents administratifs (règlement intérieur, droit à l'image) sont validés dans la page Onboarding. Le matériel PC est suivi à part — c'est une info logistique, pas un document à valider."
      value={kpis.dossiersAdmin}
      sub={`${pct(kpis.dossiersAdmin)} % · 2 documents validés`}
      icon={ClipboardCheck}
      tone="orange"
      progress={pct(kpis.dossiersAdmin)}
      href={onboardingHref}
    />
  </div>

  <div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
    <section class="space-y-2">
      <div class="flex items-baseline justify-between gap-2">
        <h2
          class="font-heading text-2xl tracking-wide text-foreground uppercase"
        >
          Checklist d’ouverture
        </h2>
      </div>
      <p
        class="font-mono text-[10px] font-medium tracking-widest text-muted-foreground uppercase"
      >
        Auto-cochée selon Onboarding, Salesforce et l’activité plateforme
      </p>
      <div class="pt-2">
        <ChecklistPanel items={checklist} />
      </div>
    </section>
    <ProgrammeJour
      {eventId}
      timeSlots={firstDayTimeSlots}
      {timezone}
      title="Programme du J1"
      emptyLabel="Aucun créneau publié pour le J1. Préparez le planning d’ouverture."
      showPlanningLink={showPlanning}
    />
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
