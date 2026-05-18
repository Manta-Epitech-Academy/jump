<script lang="ts">
  import { resolve } from '$app/paths';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import EventKpiTile from '../../components/EventKpiTile.svelte';
  import Users from '@lucide/svelte/icons/users';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import AlertCircle from '@lucide/svelte/icons/alert-circle';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import AutoScheduleDialog from '$lib/components/interviews/AutoScheduleDialog.svelte';
  import SetupStep from './SetupStep.svelte';
  import WorkloadByStaffCard from './WorkloadByStaffCard.svelte';
  import { STAGE_SECONDE_LABEL } from '$lib/domain/event';
  import type { StaffRole } from '@prisma/client';

  type Props = {
    event: { id: string; titre: string };
    timezone: string;
    daysToStart: number;
    kpis: {
      participationsTotal: number;
      interviewsScheduled: number;
      interviewersCount: number;
      unassigned: number;
    };
    interviewers: {
      id: string;
      name: string;
      image: string | null;
      role: StaffRole;
      count: number;
    }[];
    devs: { id: string; name: string; role: StaffRole }[];
    participationsToCall: any[];
    canMutate: boolean;
  };

  let {
    event,
    timezone,
    daysToStart,
    kpis,
    interviewers,
    devs,
    participationsToCall,
    canMutate,
  }: Props = $props();

  let autoOpen = $state(false);

  let step1Status = $derived(kpis.interviewersCount > 0 ? 'done' : 'current');
  let step2Status = $derived(
    kpis.interviewsScheduled > 0
      ? 'done'
      : kpis.interviewersCount > 0
        ? 'current'
        : 'todo',
  );
  let step3Status = $derived(
    kpis.unassigned === 0 && kpis.interviewsScheduled > 0
      ? 'done'
      : kpis.interviewsScheduled > 0
        ? 'current'
        : 'todo',
  );
</script>

<div class="space-y-6 pb-10">
  <PageBreadcrumb
    items={[
      {
        label: STAGE_SECONDE_LABEL,
        href: resolve(`/staff/dev/events/${event.id}`),
      },
      { label: 'Entretiens' },
    ]}
  />

  <PageHeader
    title="Entretiens"
    subtitle={`Préparation · J-${daysToStart} · ${STAGE_SECONDE_LABEL}`}
  >
    {#if canMutate && participationsToCall.length > 0 && devs.length > 0}
      <Button
        onclick={() => (autoOpen = true)}
        class="gap-2 rounded-sm bg-epi-blue text-white shadow-sm hover:bg-epi-blue/90"
      >
        <Sparkles class="h-4 w-4" />
        Lancer l'auto-planification
      </Button>
    {/if}
  </PageHeader>

  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
    <EventKpiTile
      label="Inscrits"
      value={kpis.participationsTotal}
      icon={Users}
      tone="blue"
      sub="Cohorte du stage"
    />
    <EventKpiTile
      label="Entretiens prévus"
      value={kpis.interviewsScheduled}
      icon={CalendarClock}
      tone="teal"
      sub={`${Math.round(
        (kpis.interviewsScheduled / Math.max(1, kpis.participationsTotal)) *
          100,
      )}% de la cohorte`}
      progress={Math.round(
        (kpis.interviewsScheduled / Math.max(1, kpis.participationsTotal)) *
          100,
      )}
    />
    <EventKpiTile
      label="Sans créneau"
      value={kpis.unassigned}
      icon={AlertCircle}
      tone={kpis.unassigned > 0 ? 'orange' : 'neutral'}
      sub={kpis.unassigned > 0 ? 'À planifier' : 'Tout le monde a un créneau'}
    />
    <EventKpiTile
      label="Interviewers"
      value={kpis.interviewersCount}
      icon={Users}
      tone="pink"
      sub="Disponibles sur le campus"
    />
  </div>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <div class="space-y-3 lg:col-span-2">
      <h2 class="font-heading text-lg tracking-wide uppercase">
        Mise en place
      </h2>
      <SetupStep
        index={1}
        status={step1Status as 'todo' | 'current' | 'done'}
        title="Identifier les interviewers"
        description={`${kpis.interviewersCount} membre(s) staff sont éligibles sur ce campus.`}
      />
      <SetupStep
        index={2}
        status={step2Status as 'todo' | 'current' | 'done'}
        title="Auto-planifier la cohorte"
        description="Génère un brouillon de créneaux à partir du calendrier du stage et de la disponibilité de l'équipe."
      >
        {#snippet cta()}
          {#if canMutate && devs.length > 0}
            <Button
              onclick={() => (autoOpen = true)}
              variant="outline"
              size="sm"
              class="rounded-sm"
            >
              <Sparkles class="mr-2 h-3.5 w-3.5" />
              {kpis.interviewsScheduled > 0
                ? 'Relancer l’auto-planification'
                : 'Démarrer l’auto-planification'}
            </Button>
          {/if}
        {/snippet}
      </SetupStep>
      <SetupStep
        index={3}
        status={step3Status as 'todo' | 'current' | 'done'}
        title="Revoir et ajuster"
        description={kpis.unassigned > 0
          ? `${kpis.unassigned} inscrit(s) restent sans créneau — réassignez ou complétez manuellement.`
          : 'Tous les inscrits ont un créneau. Vous pourrez ajuster le planning au fil du stage.'}
      />
    </div>

    <WorkloadByStaffCard rows={interviewers} />
  </div>

  {#if participationsToCall.length > 0}
    <Card.Root class="rounded-sm">
      <Card.Header class="pb-3">
        <Card.Title class="font-heading text-base tracking-wide uppercase">
          Inscrits sans créneau
        </Card.Title>
        <Card.Description class="text-xs">
          {participationsToCall.length} à planifier
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {#each participationsToCall.slice(0, 12) as p (p.id)}
            <a
              href={resolve(`/staff/dev/students/${p.talent.id}`)}
              class="flex items-center gap-2 rounded-sm border p-2 transition-colors hover:border-epi-blue/50"
            >
              <TalentAvatar talent={p.talent} size="sm" />
              <span class="truncate text-xs font-bold uppercase">
                {p.talent.nom} <span class="capitalize">{p.talent.prenom}</span>
              </span>
            </a>
          {/each}
        </div>
        {#if participationsToCall.length > 12}
          <p class="mt-3 text-center text-xs text-muted-foreground">
            ... et {participationsToCall.length - 12} autre(s).
          </p>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}
</div>

<AutoScheduleDialog
  bind:open={autoOpen}
  {devs}
  candidates={participationsToCall}
  {timezone}
/>
