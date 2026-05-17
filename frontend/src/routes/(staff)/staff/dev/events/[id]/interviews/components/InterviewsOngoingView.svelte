<script lang="ts">
  import { untrack } from 'svelte';
  import { resolve } from '$app/paths';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Phone from '@lucide/svelte/icons/phone';
  import Plus from '@lucide/svelte/icons/plus';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Download from '@lucide/svelte/icons/download';
  import LayoutList from '@lucide/svelte/icons/layout-list';
  import Columns3 from '@lucide/svelte/icons/columns-3';
  import { cn } from '$lib/utils';
  import ScheduleInterviewPopover from '$lib/components/interviews/ScheduleInterviewPopover.svelte';
  import AutoScheduleDialog from '$lib/components/interviews/AutoScheduleDialog.svelte';
  import InterviewKpiStrip from './InterviewKpiStrip.svelte';
  import InterviewFilterChips, {
    type InterviewFilter,
  } from './InterviewFilterChips.svelte';
  import InterviewTable from './InterviewTable.svelte';
  import InterviewStaffCalendar from './InterviewStaffCalendar.svelte';
  import ReassignDialog from './ReassignDialog.svelte';
  import WorkloadByStaffCard from './WorkloadByStaffCard.svelte';
  import CalendarSyncButton from './CalendarSyncButton.svelte';
  import type { StaffRole } from '@prisma/client';
  import type { InterviewWithRelations } from '../+page.server';
  import { getInterviewDisplayStatus } from '$lib/domain/interview';

  type Interviewer = {
    id: string;
    name: string;
    role: StaffRole;
    count: number;
  };

  type CalendarSyncState = {
    mode: 'graph' | 'email' | 'off';
    status:
      | { kind: 'connected'; lastRefreshedAt: string | Date | null }
      | {
          kind: 'needs_reauth';
          reason: 'no_account' | 'missing_scope' | 'no_refresh_token';
        }
      | { kind: 'email_ready'; recipient: string | null };
    syncedCount: number;
    lastSyncedAt: string | Date | null;
  } | null;

  type Props = {
    event: { id: string; titre: string };
    timezone: string;
    bounds: { now: string; startOfDay: string; endOfDay: string };
    scope: 'all' | 'self';
    dayN: number;
    totalDays: number;
    interviews: InterviewWithRelations[];
    participationsToCall: any[];
    interviewers: Interviewer[];
    devs: { id: string; name: string; role: StaffRole }[];
    kpis: { todo: number; planned: number; overdue: number; completed: number };
    initialFilter: InterviewFilter;
    canMutate: boolean;
    canReassign: boolean;
    calendarSync: CalendarSyncState;
    openGrid: (iv: InterviewWithRelations) => void;
  };

  let {
    event,
    timezone,
    bounds,
    scope,
    dayN,
    totalDays,
    interviews,
    participationsToCall,
    interviewers,
    devs,
    kpis,
    initialFilter,
    canMutate,
    canReassign,
    calendarSync,
    openGrid,
  }: Props = $props();

  // Seed the local filter from the URL once; afterwards the chips own it.
  let filter = $state<InterviewFilter>(untrack(() => initialFilter));
  let viewMode = $state<'table' | 'calendar'>('table');
  let autoOpen = $state(false);
  let reassignOpen = $state(false);
  let reassignSubject = $state<InterviewWithRelations | null>(null);

  let interviewerRoleById = $derived(
    new Map(interviewers.map((i) => [i.id, i.role])),
  );

  let startOfDayDate = $derived(new Date(bounds.startOfDay));

  let filteredInterviews = $derived.by(() => {
    if (filter === 'all') return interviews;
    return interviews.filter((iv) => {
      const display = getInterviewDisplayStatus(
        { status: iv.status, date: iv.date },
        { startOfDay: startOfDayDate },
      );
      if (filter === 'todo') return false; // todo lives in participationsToCall
      if (filter === 'planned')
        return display === 'planned' || display === 'overdue';
      if (filter === 'done') return display === 'done';
      return true;
    });
  });

  let filterCounts = $derived({
    all: interviews.length + participationsToCall.length,
    todo: kpis.todo,
    planned: kpis.planned + kpis.overdue,
    done: kpis.completed,
  });

  function openReassign(iv: InterviewWithRelations) {
    reassignSubject = iv;
    reassignOpen = true;
  }
</script>

<div class="space-y-6 pb-10">
  <PageBreadcrumb
    items={[
      {
        label: event.titre,
        href: resolve(`/staff/dev/events/${event.id}`),
      },
      { label: 'Entretiens' },
    ]}
  />

  <PageHeader
    title="Entretiens"
    subtitle={scope === 'self'
      ? `Mes entretiens · ${event.titre}`
      : `Jour ${dayN} / ${totalDays} · ${event.titre}`}
  >
    <CalendarSyncButton
      sync={calendarSync}
      returnTo={resolve(`/staff/dev/events/${event.id}/interviews` as any)}
      canResyncAll={canMutate && scope !== 'self'}
    />
    <a
      href={resolve(
        `/staff/dev/events/${event.id}/interviews/calendar.ics` as any,
      )}
      class="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-epi-blue"
      title="Télécharger un fichier .ics (alternative à la synchronisation Outlook)"
    >
      <Download class="h-3 w-3" />
      .ics
    </a>
    {#if canMutate && participationsToCall.length > 0 && devs.length > 0}
      <Button
        onclick={() => (autoOpen = true)}
        class="gap-2 rounded-sm bg-epi-blue text-white shadow-sm hover:bg-epi-blue/90"
      >
        <Sparkles class="h-4 w-4" />
        Auto-planifier
      </Button>
    {/if}
  </PageHeader>

  <InterviewKpiStrip
    todo={kpis.todo}
    planned={kpis.planned}
    overdue={kpis.overdue}
    completed={kpis.completed}
    activeFilter={filter}
    onSelect={(f) => (filter = f)}
  />

  {#if scope === 'all'}
    <div class="flex flex-wrap items-center justify-between gap-3">
      <InterviewFilterChips
        {filter}
        counts={filterCounts}
        onFilterChange={(next) => (filter = next)}
      />

      <div class="inline-flex rounded-sm border bg-card p-0.5">
        <button
          type="button"
          onclick={() => (viewMode = 'table')}
          aria-pressed={viewMode === 'table'}
          class={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase transition-colors',
            viewMode === 'table'
              ? 'bg-epi-blue text-white'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <LayoutList class="h-3.5 w-3.5" />
          Tableau
        </button>
        <button
          type="button"
          onclick={() => (viewMode = 'calendar')}
          aria-pressed={viewMode === 'calendar'}
          class={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-2.5 py-1 text-[10px] font-bold tracking-widest uppercase transition-colors',
            viewMode === 'calendar'
              ? 'bg-epi-blue text-white'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Columns3 class="h-3.5 w-3.5" />
          Planning par staff
        </button>
      </div>
    </div>
  {/if}

  {#if filter === 'todo' && scope === 'all'}
    <Card.Root class="rounded-sm">
      <Card.Header class="pb-3">
        <Card.Title
          class="flex items-center gap-2 font-heading text-base tracking-wide uppercase"
        >
          <Phone class="h-4 w-4" />
          À contacter
        </Card.Title>
        <Card.Description class="text-xs">
          {participationsToCall.length} inscrit(s) sans entretien planifié
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {#each participationsToCall as p (p.id)}
            {@const talent = p.talent}
            <div
              class="flex flex-col gap-2 rounded-sm border bg-card p-3 shadow-sm"
            >
              <div class="flex items-start gap-3">
                <TalentAvatar {talent} size="sm" />
                <div class="min-w-0 flex-1">
                  <a
                    href={resolve(`/staff/dev/students/${talent.id}`)}
                    class="block truncate text-sm font-bold uppercase hover:text-epi-blue"
                  >
                    {talent.nom} <span class="capitalize">{talent.prenom}</span>
                  </a>
                  <span
                    class="block truncate text-[10px] text-muted-foreground"
                  >
                    {talent.phone || talent.parentPhone || 'Aucun téléphone'}
                  </span>
                </div>
              </div>
              {#if canMutate}
                <ScheduleInterviewPopover
                  action="?/schedule"
                  participationId={p.id}
                  {timezone}
                >
                  {#snippet trigger({ props })}
                    <Button
                      size="sm"
                      variant="ghost"
                      {...props}
                      class="h-7 w-full rounded-sm text-xs font-bold text-epi-blue hover:bg-epi-blue hover:text-white"
                    >
                      <Plus class="mr-1 h-3 w-3" /> Planifier
                    </Button>
                  {/snippet}
                </ScheduleInterviewPopover>
              {/if}
            </div>
          {/each}
        </div>
      </Card.Content>
    </Card.Root>
  {:else if scope === 'all' && viewMode === 'calendar'}
    <InterviewStaffCalendar
      interviews={filteredInterviews}
      {interviewers}
      {timezone}
      {canReassign}
      onClickCard={openGrid}
    />
  {:else}
    <InterviewTable
      interviews={filteredInterviews}
      {timezone}
      bounds={{ startOfDay: bounds.startOfDay }}
      {canMutate}
      {canReassign}
      {interviewerRoleById}
      onOpenGrid={openGrid}
      onOpenReassign={openReassign}
    />
  {/if}

  {#if scope === 'all'}
    <WorkloadByStaffCard rows={interviewers} />
  {/if}
</div>

{#if scope === 'all' && canMutate}
  <AutoScheduleDialog
    bind:open={autoOpen}
    {devs}
    candidates={participationsToCall}
    {timezone}
  />
{/if}

<ReassignDialog
  bind:open={reassignOpen}
  interview={reassignSubject}
  {interviewers}
  {timezone}
/>
