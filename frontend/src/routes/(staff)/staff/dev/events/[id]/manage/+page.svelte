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
  import SuiviAdmTable from './components/SuiviAdmTable.svelte';
  import CalendarPlanner from '$lib/components/events/planning/CalendarPlanner.svelte';
  import { EVENT_TYPES } from '$lib/domain/event';
  import type { FlagKey } from '$lib/domain/featureFlags';

  let { data }: { data: PageData } = $props();

  let participations = $state(untrack(() => data.participations));
  $effect(() => {
    participations = data.participations;
  });

  let featureFlags = $derived(
    new Set<FlagKey>((data.featureFlags ?? []) as FlagKey[]),
  );

  let isStageDeSeconde = $derived(
    (data.event.eventType === EVENT_TYPES.STAGE_SECONDE ||
      data.event.titre.toLowerCase().includes('stage')) &&
      featureFlags.has('stage_seconde'),
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
          {#if isStageDeSeconde}
            <div
              class="rounded-sm border border-purple-200 bg-purple-100 px-2 py-0.5 text-[10px] tracking-widest text-purple-700 uppercase"
            >
              STAGE DE SECONDE
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
        Inscrits ({participations.length})
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

  {#if isStageDeSeconde}
    <SuiviAdmTable
      {participations}
      {optimisticAdminToggle}
      {optimisticPcToggle}
    />
  {/if}

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
