<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Clock, Pencil, Trash2, Plus } from '@lucide/svelte';
  import ActivityCard from './ActivityCard.svelte';
  import AddActivityDialog from './AddActivityDialog.svelte';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import type { TimeSlotWithActivities } from '$lib/types';
  import type { ActivityTemplate } from '@prisma/client';

  let {
    slot,
    templates,
    staticActivityForm,
    templateActivityForm,
    onEdit,
  }: {
    slot: TimeSlotWithActivities;
    templates: (ActivityTemplate & { activityTemplateThemes: { theme: { nom: string } }[] })[];
    staticActivityForm: any;
    templateActivityForm: any;
    onEdit: (slot: TimeSlotWithActivities) => void;
  } = $props();

  let addActivityOpen = $state(false);
  let deleteOpen = $state(false);

  function formatTime(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  }
</script>

<Card.Root class="overflow-hidden">
  <Card.Header class="flex flex-row items-center justify-between border-b bg-muted/30 py-3">
    <div class="flex items-center gap-2">
      <Clock class="h-4 w-4 text-epi-blue" />
      <span class="font-semibold text-sm">
        {formatTime(slot.startTime)} — {formatTime(slot.endTime)}
      </span>
      {#if slot.label}
        <span class="text-sm text-muted-foreground">· {slot.label}</span>
      {/if}
    </div>
    <div class="flex items-center gap-1">
      <Button variant="ghost" size="icon" class="h-7 w-7" onclick={() => onEdit(slot)}>
        <Pencil class="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" class="h-7 w-7" onclick={() => (deleteOpen = true)}>
        <Trash2 class="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  </Card.Header>
  <Card.Content class="p-4">
    {#if slot.activities.length === 0}
      <button
        onclick={() => (addActivityOpen = true)}
        class="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 py-6 text-sm text-muted-foreground transition-colors hover:border-epi-blue/50 hover:text-epi-blue"
      >
        <Plus class="h-4 w-4" />
        Ajouter une activité
      </button>
    {:else}
      <div class="flex flex-wrap gap-3">
        {#each slot.activities as activity (activity.id)}
          <ActivityCard {activity} />
        {/each}
        <button
          onclick={() => (addActivityOpen = true)}
          class="flex min-w-32 items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-muted-foreground/25 p-3 text-xs text-muted-foreground transition-colors hover:border-epi-blue/50 hover:text-epi-blue"
        >
          <Plus class="h-3.5 w-3.5" />
          Ajouter
        </button>
      </div>
    {/if}
  </Card.Content>
</Card.Root>

<AddActivityDialog
  bind:open={addActivityOpen}
  timeSlotId={slot.id}
  {templates}
  {staticActivityForm}
  {templateActivityForm}
/>

<ConfirmDeleteDialog
  bind:open={deleteOpen}
  action="?/deleteTimeSlot&id={slot.id}"
  title="Supprimer ce créneau ?"
  description="Le créneau et toutes ses activités seront supprimés définitivement."
/>
