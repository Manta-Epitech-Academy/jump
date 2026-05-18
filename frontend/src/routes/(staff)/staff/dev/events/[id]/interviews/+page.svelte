<script lang="ts">
  import { page } from '$app/state';
  import InterviewGridModal from '$lib/components/interviews/InterviewGridModal.svelte';
  import InterviewsPrepView from './components/InterviewsPrepView.svelte';
  import InterviewsOngoingView from './components/InterviewsOngoingView.svelte';
  import InterviewsPastView from './components/InterviewsPastView.svelte';
  import { can } from '$lib/domain/permissions';
  import { STAGE_SECONDE_LABEL } from '$lib/domain/event';
  import type { InterviewWithRelations } from './+page.server';

  let { data } = $props();

  let activeInterview = $state<InterviewWithRelations | null>(null);
  let gridOpen = $state(false);

  function openGrid(iv: InterviewWithRelations) {
    activeInterview = iv;
    gridOpen = true;
  }

  let role = $derived(page.data.staffProfile?.staffRole);
  // `scope === 'self'` is the loader's signal that the viewer is an
  // interviewer-only role (peda / manta) looking at *their own* assignments
  // — every row in `data.interviews` is theirs, so granting mutation is
  // safe and lets them close out their interviews without flagging a dev.
  // Reassign / autoSchedule stay dev-only: those are admissions decisions,
  // not the interviewer's call.
  let canMutate = $derived(can('devMember', role) || data.scope === 'self');
  let canReassign = $derived(can('devMember', role));
</script>

<svelte:head>
  <title>{STAGE_SECONDE_LABEL} — Entretiens</title>
</svelte:head>

{#if data.kind === 'prep'}
  <InterviewsPrepView
    event={data.event}
    timezone={data.timezone}
    daysToStart={data.daysToStart}
    kpis={data.kpis}
    interviewers={data.interviewers}
    devs={data.devs}
    participationsToCall={data.participationsToCall}
    {canMutate}
  />
{:else if data.kind === 'past'}
  <InterviewsPastView
    event={data.event}
    timezone={data.timezone}
    bounds={data.bounds}
    scope={data.scope}
    interviews={data.interviews}
    noInterviewParticipations={data.noInterviewParticipations}
    interviewers={data.interviewers}
    kpis={data.kpis}
    recoDistribution={data.recoDistribution}
    {openGrid}
  />
{:else}
  <InterviewsOngoingView
    event={data.event}
    timezone={data.timezone}
    bounds={data.bounds}
    scope={data.scope}
    dayN={data.dayN}
    totalDays={data.totalDays}
    interviews={data.interviews}
    participationsToCall={data.participationsToCall}
    interviewers={data.interviewers}
    devs={data.devs}
    kpis={data.kpis}
    initialFilter={data.initialFilter}
    calendarSync={data.calendarSync}
    {canMutate}
    {canReassign}
    {openGrid}
  />
{/if}

<InterviewGridModal bind:open={gridOpen} interview={activeInterview} />
