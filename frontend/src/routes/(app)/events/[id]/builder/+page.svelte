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
  import SubjectPicker from './components/SubjectPicker.svelte';
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

  let isBulkAssigning = $state(false);

  let openEditEvent = $state(false);

  let deleteEventDialogOpen = $state(false);
  let deleteParticipationDialogOpen = $state(false);
  let participationToDelete = $state<string | null>(null);

  // --- Subject Picker State ---
  let pickerOpen = $state(false);
  let bulkPickerOpen = $state(false);
  let pickerParticipationId = $state<string | null>(null);
  let pickerSelectedIds = $state<string[]>([]);
  let pickerStudentLevel = $state<string | null>(null);
  let assignmentForm: HTMLFormElement;
  let bulkAssignForm: HTMLFormElement;

  let unassignedParticipations = $derived(
    data.participations.filter((p) => !p.subjects || p.subjects.length === 0),
  );
  let assignedParticipations = $derived(
    data.participations
      .filter((p) => p.subjects && p.subjects.length > 0)
      .toSorted((a, b) => {
        const aHasDanger = a.alerts?.some((al: any) => al.type === 'danger')
          ? 2
          : 0;
        const aHasWarning = a.alerts?.length > 0 ? 1 : 0;
        const bHasDanger = b.alerts?.some((al: any) => al.type === 'danger')
          ? 2
          : 0;
        const bHasWarning = b.alerts?.length > 0 ? 1 : 0;
        return (bHasDanger || bHasWarning) - (aHasDanger || aHasWarning);
      }),
  );

  function confirmDeleteParticipation(id: string) {
    participationToDelete = id;
    deleteParticipationDialogOpen = true;
  }

  function openSubjectPicker(
    participationId: string,
    currentSubjectIds: string[],
  ) {
    pickerParticipationId = participationId;
    pickerSelectedIds = currentSubjectIds;
    const p = data.participations.find((x) => x.id === participationId);
    pickerStudentLevel = p?.studentProfile?.niveauDifficulte || null;
    pickerOpen = true;
  }

  function handleSubjectsSaved(ids: string[]) {
    if (!pickerParticipationId) return;
    const pIdInput = assignmentForm.querySelector(
      'input[name="participationId"]',
    ) as HTMLInputElement;
    const sIdsInput = assignmentForm.querySelector(
      'input[name="subjectIds"]',
    ) as HTMLInputElement;
    if (pIdInput && sIdsInput) {
      pIdInput.value = pickerParticipationId;
      sIdsInput.value = ids.join(',');
      assignmentForm.requestSubmit();
    }
  }

  function openBulkSubjectPicker() {
    pickerParticipationId = null;
    pickerSelectedIds = [];
    pickerStudentLevel = null;
    bulkPickerOpen = true;
  }

  function handleBulkSubjectsSaved(ids: string[]) {
    if (ids.length === 0) return;
    const sIdsInput = bulkAssignForm.querySelector(
      'input[name="subjectIds"]',
    ) as HTMLInputElement;
    if (sIdsInput) {
      sIdsInput.value = ids.join(',');
      bulkAssignForm.requestSubmit();
    }
    bulkPickerOpen = false;
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
            <span
              >• {new Date(data.event.date).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}</span
            >
          </div>
          {#if data.event.theme}
            <div class="flex items-center gap-1">
              <Tag class="h-3 w-3 text-teal-700" />
              <span class="text-teal-800"
                >{data.event.theme?.nom}</span
              >
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

  <Tabs.Root value="planning" class="flex-1 flex flex-col min-h-0">
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

    <Tabs.Content value="planning" class="flex-1 pt-4">
      <PlanningView
        planning={data.planning}
        templates={data.templates}
        tsForm={data.tsForm}
        staticActivityForm={data.staticActivityForm}
        templateActivityForm={data.templateActivityForm}
      />
    </Tabs.Content>

    <Tabs.Content value="participants" class="flex-1 pt-4">
      <div class="min-0 grid h-auto flex-1 gap-6 md:h-full md:grid-cols-12">
        <ParticipantManager
          {unassignedParticipations}
          {assignedParticipations}
          onDelete={confirmDeleteParticipation}
          onManageSubjects={openSubjectPicker}
          onBulkAssign={openBulkSubjectPicker}
        />

        <StudentSearchSidebar
          participations={data.participations}
          {addEnhance}
          {addDelayed}
          createStudentForm={data.createStudentForm}
        />
      </div>
    </Tabs.Content>
  </Tabs.Root>
</div>

<form
  action="?/updateSubjects"
  method="POST"
  use:enhance
  bind:this={assignmentForm}
  class="hidden"
>
  <input type="hidden" name="participationId" />
  <input type="hidden" name="subjectIds" />
</form>

<form
  action="?/bulkAssign"
  method="POST"
  use:enhance={() => {
    isBulkAssigning = true;
    return async ({ result, update }) => {
      isBulkAssigning = false;
      if (result.type === 'success') {
        const data = result.data as { message?: string } | undefined;
        toast.success(data?.message || 'Assignation terminée');
        await update();
      } else {
        toast.error("Erreur lors de l'assignation de masse");
      }
    };
  }}
  bind:this={bulkAssignForm}
  class="hidden"
>
  <input type="hidden" name="subjectIds" />
</form>

<!-- Global Subject Manager Modal -->
<SubjectPicker
  bind:open={pickerOpen}
  subjects={data.subjects}
  themes={data.themes}
  selectedSubjectIds={pickerSelectedIds}
  studentLevel={pickerStudentLevel}
  defaultThemeId={data.event.theme?.id ?? null}
  onSave={handleSubjectsSaved}
/>

<!-- Bulk Subject Picker -->
<SubjectPicker
  bind:open={bulkPickerOpen}
  subjects={data.subjects}
  themes={data.themes}
  selectedSubjectIds={[]}
  studentLevel={null}
  defaultThemeId={data.event.theme?.id ?? null}
  onSave={handleBulkSubjectsSaved}
/>

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
