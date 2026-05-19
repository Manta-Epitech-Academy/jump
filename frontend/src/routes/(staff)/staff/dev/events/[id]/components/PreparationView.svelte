<script lang="ts">
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import { resolve } from '$app/paths';
  import CountdownHero from './CountdownHero.svelte';
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import KpiCelebration from '$lib/components/staff/KpiCelebration.svelte';
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

  const is100Pct = $derived(
    kpis.total > 0 && kpis.dossiersAdmin === kpis.total,
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

  <div
    class="grid animate-in gap-4 delay-[20ms] duration-200 fill-mode-both fade-in slide-in-from-bottom-2 lg:grid-cols-3"
  >
    <div class="lg:col-span-2">
      <TalentJourneyExplainer />
    </div>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 lg:gap-4">
      <KpiTile
        label="Inscrits"
        helpText="Stagiaires inscrits à ce stage. Un compte personnel Jump leur est automatiquement créé."
        value={kpis.total}
        sub="cohorte confirmée"
        icon={UserPlus}
        tone="blue"
        align="center"
        href={inscritsHref}
      />

      <KpiCelebration active={is100Pct} tone="orange" badgeIcon={Sparkles}>
        <KpiTile
          label="Dossiers administratifs validés"
          helpText="Stagiaires pour qui les 2 documents administratifs (règlement intérieur, droit à l'image) sont validés dans la page Onboarding."
          value={kpis.dossiersAdmin}
          sub={is100Pct
            ? 'Cohorte 100% prête'
            : `${pct(kpis.dossiersAdmin)} % · 2 documents validés`}
          icon={ClipboardCheck}
          tone="orange"
          align="center"
          progress={pct(kpis.dossiersAdmin)}
          href={onboardingHref}
        />
      </KpiCelebration>
    </div>
  </div>

  {#if hasOriginsData}
    <div
      class="grid animate-in gap-4 delay-[40ms] duration-200 fill-mode-both fade-in slide-in-from-bottom-2 lg:grid-cols-2"
    >
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

  <div
    class="animate-in delay-[60ms] duration-200 fill-mode-both fade-in slide-in-from-bottom-2"
  >
    <EventNotesCard {notes} onEdit={onEditNotes} />
  </div>
</div>
