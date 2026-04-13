<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import * as Alert from '$lib/components/ui/alert';
  import { CalendarDays, Plus, AlertTriangle } from '@lucide/svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import TimeSlotCard from './TimeSlotCard.svelte';
  import AddTimeSlotDialog from './AddTimeSlotDialog.svelte';
  import type { PlanningWithSlots, TimeSlotWithActivities } from '$lib/types';
  import type { ActivityTemplate } from '@prisma/client';

  let {
    planning,
    templates,
    tsForm,
    staticActivityForm,
    templateActivityForm,
    eventId,
  }: {
    planning: PlanningWithSlots | null;
    templates: (ActivityTemplate & {
      activityTemplateThemes: { theme: { nom: string } }[];
    })[];
    tsForm: any;
    staticActivityForm: any;
    templateActivityForm: any;
    eventId: string;
  } = $props();

  let addSlotOpen = $state(false);
  let editingSlot = $state<TimeSlotWithActivities | null>(null);
  let editSlotOpen = $state(false);

  const slots = $derived(planning?.timeSlots ?? []);
  const hasEmptySlots = $derived(slots.some((s) => s.activities.length === 0));
  const hasNoActivities = $derived(
    slots.length > 0 && slots.every((s) => s.activities.length === 0),
  );

  function openEditSlot(slot: TimeSlotWithActivities) {
    editingSlot = slot;
    editSlotOpen = true;
  }
</script>

<div class="space-y-4">
  {#if slots.length > 0 && hasNoActivities}
    <Alert.Root variant="destructive">
      <AlertTriangle class="h-4 w-4" />
      <Alert.Title>Planning vide</Alert.Title>
      <Alert.Description>
        Aucun créneau ne contient d'activité. Ajoutez des activités pour
        compléter le planning.
      </Alert.Description>
    </Alert.Root>
  {:else if hasEmptySlots}
    <Alert.Root class="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle class="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <Alert.Title>Créneaux vides</Alert.Title>
      <Alert.Description class="text-amber-800 dark:text-amber-300">
        Certains créneaux n'ont pas encore d'activité assignée.
      </Alert.Description>
    </Alert.Root>
  {/if}

  {#if slots.length === 0}
    <EmptyState
      icon={CalendarDays}
      title="Aucun créneau"
      description="Commencez par ajouter des créneaux horaires pour structurer le planning de cet événement."
      actionLabel="Ajouter un créneau"
      actionCallback={() => (addSlotOpen = true)}
    />
  {:else}
    <div class="space-y-3">
      {#each slots as slot (slot.id)}
        <TimeSlotCard
          {slot}
          {templates}
          {staticActivityForm}
          {templateActivityForm}
          onEdit={openEditSlot}
          {eventId}
        />
      {/each}
    </div>

    <div class="flex justify-center">
      <Button
        variant="outline"
        onclick={() => (addSlotOpen = true)}
        class="gap-2"
      >
        <Plus class="h-4 w-4" />
        Ajouter un créneau
      </Button>
    </div>
  {/if}
</div>

<AddTimeSlotDialog bind:open={addSlotOpen} {tsForm} />

{#if editingSlot}
  <AddTimeSlotDialog bind:open={editSlotOpen} {tsForm} {editingSlot} />
{/if}
