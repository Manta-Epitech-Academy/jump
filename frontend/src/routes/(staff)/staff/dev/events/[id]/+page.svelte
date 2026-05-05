<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { toast } from 'svelte-sonner';

  import type { PageData } from './$types';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { onErrorToast } from '$lib/utils/formErrors';

  import EditEventSettingsModal from './components/EditEventSettingsModal.svelte';
  import EventActionsMenu from './components/EventActionsMenu.svelte';
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
          openEditEvent = false;
          toast.success(result.data?.form.message);
        } else if (result.type === 'failure') {
          toast.error(result.data?.form?.message ?? 'Action impossible.');
        }
      },
      onError: onErrorToast(),
    },
  );

  let openEditEvent = $state(false);
  let deleteEventDialogOpen = $state(false);

  const eventDate = $derived(new Date(data.event.date));
  const eventEndDate = $derived(
    data.event.endDate ? new Date(data.event.endDate) : null,
  );
</script>

<svelte:head>
  <title>{data.event.titre}</title>
</svelte:head>

<div class="flex flex-col gap-4">
  <div class="flex items-start justify-between gap-3">
    <PageBreadcrumb
      items={[
        { label: 'Dashboard', href: resolve('/staff/dev') },
        { label: data.event.titre },
      ]}
    />
    <EventActionsMenu
      onEdit={() => (openEditEvent = true)}
      onDelete={() => (deleteEventDialogOpen = true)}
    />
  </div>

  {#if data.kind === 'stage' && data.status === 'upcoming'}
    <PreparationView
      eventId={data.event.id}
      titre={data.event.titre}
      notes={data.event.notes}
      daysToStart={data.prep.daysToStart}
      openDate={new Date(data.prep.openDate)}
      timezone={data.timezone}
      kpis={data.prep.kpis}
      alerts={data.prep.alerts}
      firstDayTimeSlots={data.prep.firstDayTimeSlots}
      lyceesBreakdown={data.prep.lyceesBreakdown}
      interestsCloud={data.prep.interestsCloud}
      onEditNotes={() => (openEditEvent = true)}
    />
  {:else if data.kind === 'stage' && data.status === 'ongoing'}
    <OngoingView
      eventId={data.event.id}
      titre={data.event.titre}
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
      onEditNotes={() => (openEditEvent = true)}
    />
  {:else if data.kind === 'stage' && data.status === 'past'}
    <PastView
      titre={data.event.titre}
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
      onEditNotes={() => (openEditEvent = true)}
    />
  {/if}
</div>

<EditEventSettingsModal
  bind:open={openEditEvent}
  bind:deleteEventDialogOpen
  {editForm}
  {editErrors}
  {editEnhance}
  {editDelayed}
  themes={data.themes}
  staff={data.staff}
/>

<ConfirmDeleteDialog
  bind:open={deleteEventDialogOpen}
  action="?/deleteEvent"
  title="Supprimer définitivement ?"
  description="Cette action est irréversible. Toutes les données associées à cet événement seront perdues."
  buttonText="Confirmer la suppression"
  onSuccess={() => goto(resolve('/staff/dev'))}
/>
