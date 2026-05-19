<script lang="ts">
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import { resolve } from '$app/paths';
  import CountdownHero from './CountdownHero.svelte';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import LyceesBreakdown from './LyceesBreakdown.svelte';
  import InterestsCloud from './InterestsCloud.svelte';
  import EventNotesCard from './EventNotesCard.svelte';
  import TalentJourneyExplainer from '$lib/components/dev/TalentJourneyExplainer.svelte';

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
    notes,
    daysToStart,
    openDate,
    timezone,
    kpis,
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
  <CountdownHero {daysToStart} {openDate} {timezone} />

  <div class="grid gap-4 lg:grid-cols-3">
    <div class="lg:col-span-2">
      <TalentJourneyExplainer />
    </div>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 lg:gap-4">
      <KpiTile
        label="Inscrits"
        helpText="Talents inscrits à ce stage. Un compte personnel Jump leur est automatiquement créé."
        value={kpis.total}
        sub="cohorte confirmée"
        icon={UserPlus}
        tone="blue"
        align="center"
        href={inscritsHref}
      />
      <KpiTile
        label="Dossiers administratifs validés"
        helpText="Talents pour qui les 2 documents administratifs (règlement intérieur, droit à l'image) sont validés dans la page Onboarding. Le matériel PC est suivi à part — c'est une info logistique, pas un document à valider."
        value={kpis.dossiersAdmin}
        sub={`${pct(kpis.dossiersAdmin)} % · 2 documents validés`}
        icon={ClipboardCheck}
        tone="orange"
        align="center"
        progress={pct(kpis.dossiersAdmin)}
        href={onboardingHref}
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
