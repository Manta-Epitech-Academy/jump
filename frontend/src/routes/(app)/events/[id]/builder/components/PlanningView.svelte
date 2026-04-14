<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Alert from '$lib/components/ui/alert';
  import * as Tabs from '$lib/components/ui/tabs';
  import {
    CalendarDays,
    Plus,
    TriangleAlert,
    LayoutTemplate,
  } from '@lucide/svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import TimeSlotCard from './TimeSlotCard.svelte';
  import AddTimeSlotDialog from './AddTimeSlotDialog.svelte';
  import ApplyPlanningTemplateDialog from './ApplyPlanningTemplateDialog.svelte';
  import type { PlanningWithSlots, TimeSlotWithActivities } from '$lib/types';
  import type { ActivityTemplate } from '@prisma/client';

  let {
    planning,
    templates,
    tsForm,
    staticActivityForm,
    templateActivityForm,
    eventId,
    planningTemplates = [],
    applyTemplateForm,
  }: {
    planning: PlanningWithSlots | null;
    templates: (ActivityTemplate & {
      activityTemplateThemes: { theme: { nom: string } }[];
    })[];
    tsForm: any;
    staticActivityForm: any;
    templateActivityForm: any;
    eventId: string;
    planningTemplates: {
      id: string;
      nom: string;
      nbDays: number;
      description: string | null;
      _count: { days: number };
    }[];
    applyTemplateForm: any;
  } = $props();

  let addSlotOpen = $state(false);
  let editingSlot = $state<TimeSlotWithActivities | null>(null);
  let editSlotOpen = $state(false);
  let applyTemplateOpen = $state(false);

  const slots = $derived(planning?.timeSlots ?? []);
  const hasEmptySlots = $derived(slots.some((s) => s.activities.length === 0));
  const hasNoActivities = $derived(
    slots.length > 0 && slots.every((s) => s.activities.length === 0),
  );

  // Group slots by date for multi-day display
  function getDateKey(date: Date | string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  function formatDateHeader(date: Date | string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      timeZone: 'Europe/Paris',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  function formatShortDate(date: Date | string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      timeZone: 'Europe/Paris',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  const slotsByDate = $derived.by(() => {
    const groups: { dateKey: string; label: string; slots: typeof slots }[] =
      [];
    const map = new Map<string, typeof slots>();

    for (const slot of slots) {
      const key = getDateKey(slot.startTime);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(slot);
    }

    for (const [dateKey, dateSlots] of map) {
      groups.push({
        dateKey,
        label: formatDateHeader(dateSlots[0].startTime),
        slots: dateSlots,
      });
    }

    return groups;
  });

  const isMultiDay = $derived(slotsByDate.length > 1);
  let activeDay = $state('');

  // Auto-select first day when data changes
  $effect(() => {
    const groups = slotsByDate;
    if (
      groups.length > 0 &&
      (!activeDay || !groups.some((g) => g.dateKey === activeDay))
    ) {
      activeDay = groups[0].dateKey;
    }
  });

  function openEditSlot(slot: TimeSlotWithActivities) {
    editingSlot = slot;
    editSlotOpen = true;
  }
</script>

<div class="space-y-4">
  {#if slots.length > 0 && hasNoActivities}
    <Alert.Root variant="destructive">
      <TriangleAlert class="h-4 w-4" />
      <Alert.Title>Planning vide</Alert.Title>
      <Alert.Description>
        Aucun créneau ne contient d'activité. Ajoutez des activités pour
        compléter le planning.
      </Alert.Description>
    </Alert.Root>
  {:else if hasEmptySlots}
    <Alert.Root
      class="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <TriangleAlert class="h-4 w-4 text-amber-600 dark:text-amber-400" />
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
      description="Commencez par ajouter des créneaux horaires ou appliquez un modèle de planning."
      actionLabel="Ajouter un créneau"
      actionCallback={() => (addSlotOpen = true)}
    />
    {#if planningTemplates.length > 0}
      <div class="flex justify-center">
        <Button
          variant="outline"
          onclick={() => (applyTemplateOpen = true)}
          class="gap-2"
        >
          <LayoutTemplate class="h-4 w-4" />
          Appliquer un modèle
        </Button>
      </div>
    {/if}
  {:else if isMultiDay}
    <Tabs.Root bind:value={activeDay}>
      <div class="flex items-center justify-between gap-2">
        <Tabs.List class="flex-wrap">
          {#each slotsByDate as group, i (group.dateKey)}
            <Tabs.Trigger value={group.dateKey} class="gap-1.5">
              <span class="font-bold">J{i + 1}</span>
              <span class="hidden text-xs text-muted-foreground sm:inline">
                {formatShortDate(group.slots[0].startTime)}
              </span>
              <Badge variant="secondary" class="ml-1 text-[10px]">
                {group.slots.length}
              </Badge>
            </Tabs.Trigger>
          {/each}
        </Tabs.List>

        <div class="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onclick={() => (addSlotOpen = true)}
            class="gap-1.5"
          >
            <Plus class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">Créneau</span>
          </Button>
          {#if planningTemplates.length > 0}
            <Button
              variant="outline"
              size="sm"
              onclick={() => (applyTemplateOpen = true)}
              class="gap-1.5"
            >
              <LayoutTemplate class="h-3.5 w-3.5" />
              <span class="hidden sm:inline">Modèle</span>
            </Button>
          {/if}
        </div>
      </div>

      {#each slotsByDate as group (group.dateKey)}
        <Tabs.Content value={group.dateKey} class="mt-4 space-y-3">
          <h3 class="text-sm font-bold text-epi-blue capitalize">
            <CalendarDays class="mr-1.5 inline h-4 w-4" />
            {group.label}
          </h3>
          {#each group.slots as slot (slot.id)}
            <TimeSlotCard
              {slot}
              {templates}
              {staticActivityForm}
              {templateActivityForm}
              onEdit={openEditSlot}
              {eventId}
            />
          {/each}
        </Tabs.Content>
      {/each}
    </Tabs.Root>
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

    <div class="flex justify-center gap-2">
      <Button
        variant="outline"
        onclick={() => (addSlotOpen = true)}
        class="gap-2"
      >
        <Plus class="h-4 w-4" />
        Ajouter un créneau
      </Button>
      {#if planningTemplates.length > 0}
        <Button
          variant="outline"
          onclick={() => (applyTemplateOpen = true)}
          class="gap-2"
        >
          <LayoutTemplate class="h-4 w-4" />
          Appliquer un modèle
        </Button>
      {/if}
    </div>
  {/if}
</div>

<AddTimeSlotDialog bind:open={addSlotOpen} {tsForm} />

{#if editingSlot}
  <AddTimeSlotDialog bind:open={editSlotOpen} {tsForm} {editingSlot} />
{/if}

{#if planningTemplates.length > 0}
  <ApplyPlanningTemplateDialog
    bind:open={applyTemplateOpen}
    {planningTemplates}
    {applyTemplateForm}
    {planning}
  />
{/if}
