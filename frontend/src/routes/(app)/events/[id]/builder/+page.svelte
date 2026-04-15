<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import {
    Calendar as CalendarIcon,
    ArrowLeft,
    UserCheck,
    Tag,
    CalendarDays,
    Users,
  } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';

  import type { PageData } from './$types';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import * as Tabs from '$lib/components/ui/tabs';
  import { resolve } from '$app/paths';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';

  import EditEventSettingsModal from './components/EditEventSettingsModal.svelte';
  import ParticipantManager from './components/ParticipantManager.svelte';
  import StudentSearchSidebar from './components/StudentSearchSidebar.svelte';
  import PlanningView from './components/PlanningView.svelte';

  let { data }: { data: PageData } = $props();

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
        }
      },
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
</script>

<div
  class="flex h-auto min-h-[calc(100vh-8rem)] flex-col space-y-4 md:h-[calc(100vh-10rem)]"
>
  <div class="flex items-center justify-between border-b pb-4">
    <div class="flex items-center gap-4">
      <a
        href={resolve('/')}
        class={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <ArrowLeft class="h-4 w-4" />
      </a>
      <div>
        <h1 class="text-3xl font-bold text-epi-blue uppercase">
          Événement<span class="text-epi-teal">_</span>
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
                hour: '2-digit',
                minute: '2-digit',
              })}{#if data.event.endDate}
                → {new Date(data.event.endDate).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                })}
              {/if}
            </span>
          </div>
          {#if data.event.theme}
            <div class="flex items-center gap-1">
              <Tag class="h-3 w-3 text-teal-700" />
              <span class="text-teal-800">{data.event.theme?.nom}</span>
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
      <Button
        variant="default"
        href={resolve(`/events/${data.event.id}/appel`)}
        class="shadow-lg"
      >
        <UserCheck class="mr-2 h-4 w-4" />
        <span class="hidden sm:inline">Faire l'appel</span>
        <span class="sm:hidden">Appel</span>
      </Button>
    </div>
  </div>

  <Tabs.Root value="planning" class="flex min-h-0 flex-1 flex-col">
    <Tabs.List class="grid w-full grid-cols-2">
      <Tabs.Trigger value="planning" class="gap-2">
        <CalendarDays class="h-4 w-4" />
        Planning
      </Tabs.Trigger>
      <Tabs.Trigger value="participants" class="gap-2">
        <Users class="h-4 w-4" />
        Participants ({data.participations.length})
      </Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="planning" class="flex-1 pt-4 pb-12">
      <PlanningView
        planning={data.planning}
        templates={data.templates}
        tsForm={data.tsForm}
        staticActivityForm={data.staticActivityForm}
        templateActivityForm={data.templateActivityForm}
        eventId={data.event.id}
        planningTemplates={data.planningTemplates}
        applyTemplateForm={data.applyTemplateForm}
      />
    </Tabs.Content>

    <Tabs.Content value="participants" class="flex-1 pt-4 pb-12">
      <div class="min-0 grid h-auto flex-1 gap-6 md:h-full md:grid-cols-12">
        <ParticipantManager
          participations={data.participations}
          onDelete={confirmDeleteParticipation}
        />

        <StudentSearchSidebar
          participations={data.participations}
          {addEnhance}
          {addDelayed}
        />
      </div>
    </Tabs.Content>
  </Tabs.Root>
</div>

<ConfirmDeleteDialog
  bind:open={deleteEventDialogOpen}
  action="?/deleteEvent"
  title="Supprimer définitivement ?"
  description="Cette action est irréversible. Toutes les données associées à cet événement seront perdues."
  buttonText="Confirmer la suppression"
  onSuccess={() => goto(resolve('/'))}
/>

<ConfirmDeleteDialog
  bind:open={deleteParticipationDialogOpen}
  action="?/remove&id={participationToDelete}"
  title="Retirer l'élève ?"
  description="Voulez-vous retirer cet élève de l'événement ? S'il était validé, son XP sera annulé."
  buttonText="Retirer"
/>
