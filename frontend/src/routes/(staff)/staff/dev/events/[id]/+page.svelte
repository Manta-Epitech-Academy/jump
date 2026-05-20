<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';

  import type { PageData } from './$types';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import { onErrorToast } from '$lib/utils/formErrors';
  import { track } from '$lib/analytics';
  import { STAGE_SECONDE_LABEL, eventTypeHasTheme } from '$lib/domain/event';

  import EditEventDialog from './components/EditEventDialog.svelte';
  import EventSalesforceButton from '$lib/components/events/EventSalesforceButton.svelte';
  import PreparationView from './components/PreparationView.svelte';
  import OngoingView from './components/OngoingView.svelte';
  import PastView from './components/PastView.svelte';
  import EventDashboard from './components/EventDashboard.svelte';

  let { data }: { data: PageData } = $props();

  const {
    form: editForm,
    errors: editErrors,
    enhance: editEnhance,
    delayed: editDelayed,
  } = superForm(
    untrack(() => data.editForm),
    {
      id: 'edit-event',
      resetForm: false,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          track('event_updated');
          openEditEvent = false;
          toast.success(result.data?.form.message);
        } else if (result.type === 'failure') {
          track('event_update_failed');
          toast.error(result.data?.form?.message ?? 'Action impossible.');
        }
      },
      onError: onErrorToast(),
    },
  );

  let openEditEvent = $state(false);

  const eventDate = $derived(new Date(data.event.date));
  const eventEndDate = $derived(
    data.event.endDate ? new Date(data.event.endDate) : null,
  );

  const pageTitle = $derived(
    data.kind === 'stage' ? STAGE_SECONDE_LABEL : data.event.titre,
  );

  const showPlanning = $derived(data.featureFlags.includes('event_planning'));
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="flex flex-col gap-4">
  {#if data.kind !== 'stage' || data.event.externalId}
    <div class="flex items-start justify-between gap-3">
      {#if data.kind !== 'stage'}
        <PageBreadcrumb items={[{ label: pageTitle }]} />
      {:else}
        <div></div>
      {/if}
      <EventSalesforceButton externalId={data.event.externalId} />
    </div>
  {/if}

  {#if data.kind === 'stage' && data.status === 'upcoming'}
    <PreparationView
      eventId={data.event.id}
      notes={data.event.notes}
      daysToStart={data.prep.daysToStart}
      openDate={new Date(data.prep.openDate)}
      timezone={data.timezone}
      kpis={data.prep.kpis}
      lyceesBreakdown={data.prep.lyceesBreakdown}
      interestsCloud={data.prep.interestsCloud}
      onEditNotes={() => (openEditEvent = true)}
    />
  {:else if data.kind === 'stage' && data.status === 'ongoing'}
    <OngoingView
      eventId={data.event.id}
      notes={data.event.notes}
      dayN={data.ongoing.dayN}
      totalDays={data.ongoing.totalDays}
      startDate={eventDate}
      endDate={eventEndDate ?? eventDate}
      timezone={data.timezone}
      kpis={data.ongoing.kpis}
      alerts={data.ongoing.alerts}
      timeSlots={data.ongoing.todayTimeSlots}
      mesProchainsEntretiens={data.ongoing.mesProchainsEntretiens}
      lyceesBreakdown={data.ongoing.lyceesBreakdown}
      interestsCloud={data.ongoing.interestsCloud}
      {showPlanning}
      onEditNotes={() => (openEditEvent = true)}
    />
  {:else if data.kind === 'stage' && data.status === 'past'}
    <PastView
      eventId={data.event.id}
      notes={data.event.notes}
      startDate={eventDate}
      endDate={new Date(data.past.endDate)}
      timezone={data.timezone}
      stats={data.past.stats}
      onEditNotes={() => (openEditEvent = true)}
    />
  {:else if data.kind === 'event'}
    <EventDashboard
      eventId={data.event.id}
      titre={data.event.titre}
      date={eventDate}
      endDate={eventEndDate}
      notes={data.event.notes}
      timezone={data.timezone}
      themeName={data.event.theme?.nom ?? null}
      mantasCount={data.event.mantas.length}
      stats={data.legacy.stats}
      alerts={data.legacy.alerts}
      showIntervenants={data.featureFlags.includes('staff_intervenants')}
      {showPlanning}
      onEditNotes={() => (openEditEvent = true)}
    />
  {/if}
</div>

<EditEventDialog
  bind:open={openEditEvent}
  {editForm}
  {editErrors}
  {editEnhance}
  {editDelayed}
  themes={data.themes}
  canHaveTheme={eventTypeHasTheme(data.event.eventType)}
/>
