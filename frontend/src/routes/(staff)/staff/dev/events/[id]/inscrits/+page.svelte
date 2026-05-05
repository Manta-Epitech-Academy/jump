<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import ParticipantManager from './components/ParticipantManager.svelte';
  import StudentSearchSidebar from './components/StudentSearchSidebar.svelte';
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
    data.event.eventType === EVENT_TYPES.STAGE_SECONDE &&
      featureFlags.has('stage_seconde'),
  );

  const { enhance: addEnhance, delayed: addDelayed } = superForm(
    untrack(() => data.addForm),
    { id: 'add-existing', invalidateAll: true },
  );

  let deleteDialogOpen = $state(false);
  let participationToDelete = $state<string | null>(null);

  function confirmDelete(id: string) {
    participationToDelete = id;
    deleteDialogOpen = true;
  }
</script>

<svelte:head>
  <title>{data.event.titre} — Inscrits</title>
</svelte:head>

<div class="flex h-full flex-col space-y-6 pb-10">
  <PageBreadcrumb
    items={[
      { label: 'Dashboard', href: resolve('/staff/dev') },
      {
        label: data.event.titre,
        href: resolve(`/staff/dev/events/${data.event.id}/manage`),
      },
      { label: 'Inscrits' },
    ]}
  />
  <PageHeader
    title="Inscrits"
    subtitle={`${data.event.titre} — ${participations.length} talent${participations.length > 1 ? 's' : ''}`}
  />

  <div class="grid gap-6 md:grid-cols-12">
    <ParticipantManager
      {participations}
      onDelete={confirmDelete}
      showCompliance={isStageDeSeconde}
    />
    <StudentSearchSidebar {participations} {addEnhance} {addDelayed} />
  </div>
</div>

<ConfirmDeleteDialog
  bind:open={deleteDialogOpen}
  action="?/remove&id={participationToDelete}"
  title="Retirer le Talent ?"
  description="Voulez-vous retirer ce Talent de l'événement ?"
  buttonText="Retirer"
/>
