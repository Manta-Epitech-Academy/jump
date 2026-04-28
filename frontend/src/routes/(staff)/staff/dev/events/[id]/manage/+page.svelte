<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import {
    Calendar as CalendarIcon,
    ArrowLeft,
    Tag,
    Users,
  } from '@lucide/svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';

  import type { PageData } from './$types';
  import { buttonVariants } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import { onErrorToast } from '$lib/utils/formErrors';
  import { can } from '$lib/domain/permissions';

  import EditEventSettingsModal from './components/EditEventSettingsModal.svelte';
  import CalendarPlanner from '$lib/components/events/planning/CalendarPlanner.svelte';

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
</script>

<div class="flex flex-col space-y-6 pb-12">
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
          class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-muted-foreground"
        >
          <div class="flex items-center gap-2">
            <CalendarIcon class="h-3.5 w-3.5" />
            <span style:view-transition-name="event-title-{data.event.id}"
              >{data.event.titre}</span
            >
            <span>
              • {new Date(data.event.date).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
                timeZone: data.timezone,
              })}
            </span>
          </div>
          {#if data.event.theme}
            <div class="flex items-center gap-1.5 uppercase">
              <Tag class="h-3.5 w-3.5 text-epi-teal-solid" />
              <span class="text-epi-teal-solid">{data.event.theme?.nom}</span>
            </div>
          {/if}
        </div>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <a
        href={resolve(`/staff/dev/events/${data.event.id}/inscrits`)}
        class={buttonVariants({
          variant: 'outline',
          class: 'gap-2 rounded-sm',
        })}
      >
        <Users class="h-4 w-4" />
        Inscrits ({data.participationsCount})
      </a>
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

  <CalendarPlanner
    planning={data.planning}
    templates={data.templates}
    eventDate={data.event.date}
    eventEndDate={data.event.endDate}
    planningTemplates={data.planningTemplates}
    applyTemplateForm={data.applyTemplateForm}
    timezone={data.timezone}
    containerClass="h-[calc(100vh-14rem)] min-h-[600px]"
    canEdit={can('devLead', data.staffProfile?.staffRole)}
    eventId={data.event.id}
  />
</div>

<ConfirmDeleteDialog
  bind:open={deleteEventDialogOpen}
  action="?/deleteEvent"
  title="Supprimer définitivement ?"
  description="Cette action est irréversible. Toutes les données associées à cet événement seront perdues."
  buttonText="Confirmer la suppression"
  onSuccess={() => goto(resolve('/staff/dev'))}
/>
