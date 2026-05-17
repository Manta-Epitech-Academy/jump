<script lang="ts">
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import KeyRound from '@lucide/svelte/icons/key-round';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import { resolve } from '$app/paths';
  import ChecklistPanel from '$lib/components/staff/ChecklistPanel.svelte';
  import type { ChecklistItem } from '$lib/server/services/eventTasks';
  import { activityTypes } from '$lib/validation/templates';
  import CountdownHero from './CountdownHero.svelte';
  import EventKpiTile from './EventKpiTile.svelte';
  import ProgrammeJour from './ProgrammeJour.svelte';
  import LyceesBreakdown from './LyceesBreakdown.svelte';
  import InterestsCloud from './InterestsCloud.svelte';
  import EventNotesCard from './EventNotesCard.svelte';
  import TalentJourneyExplainer from '$lib/components/dev/TalentJourneyExplainer.svelte';

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
    checklist,
    firstDayTimeSlots,
    lyceesBreakdown,
    interestsCloud,
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
  <CountdownHero {titre} {daysToStart} {openDate} {timezone} />

  <TalentJourneyExplainer />

  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <EventKpiTile
      label="Inscrits"
      helpText="Talents inscrits à ce stage (synchro automatique Salesforce). Un compte personnel Jump leur est automatiquement créé."
      value={kpis.total}
      sub="cohorte confirmée"
      icon={UserPlus}
      tone="blue"
      href={inscritsHref}
    />
    <EventKpiTile
      label="Comptes activés"
      helpText="Talents qui se sont connectés au moins une fois à leur espace Jump (via le code OTP reçu par email)."
      value={kpis.comptesActives}
      sub={`${pct(kpis.comptesActives)} % · ${kpis.total - kpis.comptesActives} à relancer`}
      icon={KeyRound}
      tone="teal"
      progress={pct(kpis.comptesActives)}
      href={`${inscritsHref}?filter=never-logged`}
    />
    <EventKpiTile
      label="Profil complété"
      helpText="Talents ayant terminé toutes les étapes de leur onboarding dans leur espace : infos perso, lycée, centres d'intérêt, règlement intérieur signé."
      value={kpis.profilComplete}
      sub={`${pct(kpis.profilComplete)} % · onboarding plateforme`}
      icon={UserCheck}
      tone="pink"
      progress={pct(kpis.profilComplete)}
      href={`${inscritsHref}?filter=profile-incomplete`}
    />
    <EventKpiTile
      label="Dossiers admin OK"
      helpText="Talents pour qui les 3 documents administratifs (règlement intérieur, droit à l'image, matériel PC) sont validés dans la page Onboarding."
      value={kpis.dossiersAdmin}
      sub={`${pct(kpis.dossiersAdmin)} % · 3 documents validés`}
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
