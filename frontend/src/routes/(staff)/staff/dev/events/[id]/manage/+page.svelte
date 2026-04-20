<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import {
    Calendar as CalendarIcon,
    ArrowLeft,
    Tag,
    Users,
    FileCheck,
    CalendarDays,
  } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';

  import type { PageData } from './$types';
  import { buttonVariants } from '$lib/components/ui/button';
  import * as Tabs from '$lib/components/ui/tabs';
  import { resolve } from '$app/paths';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { onErrorToast } from '$lib/utils/formErrors';
  import { can } from '$lib/domain/permissions';

  import EditEventSettingsModal from './components/EditEventSettingsModal.svelte';
  import ParticipantManager from './components/ParticipantManager.svelte';
  import StudentSearchSidebar from './components/StudentSearchSidebar.svelte';
  import SuiviAdmTable from './components/SuiviAdmTable.svelte';
  import CalendarPlanner from '$lib/components/events/planning/CalendarPlanner.svelte';
  import { EVENT_TYPES } from '$lib/domain/event';

  let { data }: { data: PageData } = $props();

  let participations = $state(untrack(() => data.participations));
  $effect(() => {
    participations = data.participations;
  });

  let isStageDeSeconde = $derived(
    data.event.eventType === EVENT_TYPES.STAGE_SECONDE ||
      data.event.titre.toLowerCase().includes('stage'),
  );

  const { enhance: addEnhance, delayed: addDelayed } = superForm(
    untrack(() => data.addForm),
    { id: 'add-existing', invalidateAll: true },
  );

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
  let deleteParticipationDialogOpen = $state(false);
  let participationToDelete = $state<string | null>(null);

  function confirmDeleteParticipation(id: string) {
    participationToDelete = id;
    deleteParticipationDialogOpen = true;
  }

  const optimisticAdminToggle = (id: string, docType: string) => {
    return () => {
      const index = participations.findIndex((p) => p.id === id);
      if (index !== -1) {
        const compliance = (participations[index].stageCompliance ??= {
          charteSigned: false,
          conventionSigned: false,
          imageRightsSigned: false,
          participationId: id,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        if (docType === 'charte')
          compliance.charteSigned = !compliance.charteSigned;
        if (docType === 'convention')
          compliance.conventionSigned = !compliance.conventionSigned;
        if (docType === 'image')
          compliance.imageRightsSigned = !compliance.imageRightsSigned;
      }
      return async ({ update }: { update: () => Promise<void> }) => {
        await update();
      };
    };
  };

  const optimisticPcToggle = (id: string) => {
    return () => {
      const index = participations.findIndex((p) => p.id === id);
      if (index !== -1)
        participations[index].bringPc = !participations[index].bringPc;
      return async ({ update }: { update: () => Promise<void> }) => {
        await update();
      };
    };
  };
</script>

<div
  class="flex h-auto min-h-[calc(100vh-8rem)] flex-col space-y-4 md:h-[calc(100vh-10rem)]"
>
  <div class="flex items-center justify-between border-b pb-4">
    <div class="flex items-center gap-4">
      <a
        href={resolve('/staff/dev')}
        class={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <ArrowLeft class="h-4 w-4" />
      </a>
      <div>
        <h1 class="text-3xl font-bold text-epi-blue uppercase">
          Gestion Événement<span class="text-epi-teal">_</span>
        </h1>
        <div
          class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-muted-foreground uppercase"
        >
          <div class="flex items-center gap-2">
            <CalendarIcon class="h-3 w-3" />
            <span style:view-transition-name="event-title-{data.event.id}"
              >{data.event.titre}</span
            >
            <span>
              • {new Date(data.event.date).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                timeZone: data.timezone,
              })}
            </span>
          </div>
          {#if data.event.theme}
            <div class="flex items-center gap-1">
              <Tag class="h-3 w-3 text-teal-700" />
              <span class="text-teal-800">{data.event.theme?.nom}</span>
            </div>
          {/if}
          {#if isStageDeSeconde}
            <div
              class="rounded-sm border border-purple-200 bg-purple-100 px-2 py-0.5 text-[10px] text-purple-700"
            >
              STAGE DE SECONDE
            </div>
          {/if}
        </div>
      </div>
    </div>
    <div class="flex gap-2">
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
    </div>
  </div>

  <Tabs.Root
    value={isStageDeSeconde ? 'suivi' : 'inscriptions'}
    class="flex min-h-0 flex-1 flex-col"
  >
    <Tabs.List
      class="grid w-full max-w-2xl {isStageDeSeconde
        ? 'grid-cols-3'
        : 'grid-cols-2'}"
    >
      {#if isStageDeSeconde}
        <Tabs.Trigger value="suivi" class="gap-2">
          <FileCheck class="h-4 w-4" />
          Suivi Administratif
        </Tabs.Trigger>
      {/if}
      <Tabs.Trigger value="inscriptions" class="gap-2">
        <Users class="h-4 w-4" />
        Inscriptions ({participations.length})
      </Tabs.Trigger>
      <Tabs.Trigger value="planning" class="gap-2">
        <CalendarDays class="h-4 w-4" />
        Planning
      </Tabs.Trigger>
    </Tabs.List>

    {#if isStageDeSeconde}
      <Tabs.Content value="suivi" class="flex-1 pt-4 pb-12">
        <SuiviAdmTable
          {participations}
          {optimisticAdminToggle}
          {optimisticPcToggle}
        />
      </Tabs.Content>
    {/if}

    <Tabs.Content value="inscriptions" class="flex-1 pt-4 pb-12">
      <div class="min-0 grid h-auto flex-1 gap-6 md:h-full md:grid-cols-12">
        <ParticipantManager
          {participations}
          onDelete={confirmDeleteParticipation}
        />
        <StudentSearchSidebar {participations} {addEnhance} {addDelayed} />
      </div>
    </Tabs.Content>

    <Tabs.Content value="planning" class="flex-1 pt-4 pb-12">
      <CalendarPlanner
        planning={data.planning}
        templates={data.templates}
        tsForm={data.tsForm}
        staticActivityForm={data.staticActivityForm}
        templateActivityForm={data.templateActivityForm}
        eventId={data.event.id}
        eventDate={data.event.date}
        eventEndDate={data.event.endDate}
        planningTemplates={data.planningTemplates}
        applyTemplateForm={data.applyTemplateForm}
        timezone={data.timezone}
        containerClass="h-[calc(100vh-18rem)] min-h-[600px]"
        canEdit={can('devLead', data.staffProfile?.staffRole)}
      />
    </Tabs.Content>
  </Tabs.Root>
</div>

<ConfirmDeleteDialog
  bind:open={deleteEventDialogOpen}
  action="?/deleteEvent"
  title="Supprimer définitivement ?"
  description="Cette action est irréversible. Toutes les données associées à cet événement seront perdues."
  buttonText="Confirmer la suppression"
  onSuccess={() => goto(resolve('/staff/dev'))}
/>

<ConfirmDeleteDialog
  bind:open={deleteParticipationDialogOpen}
  action="?/remove&id={participationToDelete}"
  title="Retirer le Talent ?"
  description="Voulez-vous retirer ce Talent de l'événement ?"
  buttonText="Retirer"
/>
