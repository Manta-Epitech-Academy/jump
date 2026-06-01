<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { enhance as kitEnhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Copy from '@lucide/svelte/icons/copy';
  import Search from '@lucide/svelte/icons/search';
  import Clock from '@lucide/svelte/icons/clock';
  import Zap from '@lucide/svelte/icons/zap';
  import FileText from '@lucide/svelte/icons/file-text';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { TimePicker } from '$lib/components/ui/time-picker';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Select from '$lib/components/ui/select';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import ConfirmDeleteDialog from '$lib/components/admin/ConfirmDeleteDialog.svelte';
  import TemplateTimeline from '$lib/components/admin/TemplateTimeline.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { toast } from 'svelte-sonner';
  import {
    activityTypeLabels,
    activityTypeStyles,
    activityTypes,
  } from '$lib/validation/templates';

  let { data } = $props();

  const pt = $derived(data.planningTemplate);
  const days = $derived(pt.days);

  let activeDay = $state('0');

  // Slot dialog (create or edit)
  let slotDialogOpen = $state(false);
  let editingSlotId = $state<string | null>(null);
  let slotDialogDayId = $state('');

  // Slot dialog fields
  let slotStartTime = $state('09:00');
  let slotEndTime = $state('10:00');
  let slotActivityTemplateId = $state('');
  let slotNom = $state('');
  let slotActivityType = $state<(typeof activityTypes)[number]>('orga');

  // Template search inside slot dialog
  let searchQuery = $state('');
  let typeFilter = $state('all');

  // Duplicate dialog
  let duplicateOpen = $state(false);
  let duplicateSourceId = $state('');
  let duplicateTargetId = $state('');

  // Delete dialog
  let deleteSlotOpen = $state(false);
  let slotToDelete = $state<string | null>(null);

  const { form: slotForm, enhance: slotEnhance } = superForm(
    untrack(() => data.slotForm),
    {
      id: 'slot-form',
      invalidateAll: true,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          slotDialogOpen = false;
          toast.success(result.data?.form?.message);
        }
      },
    },
  );

  const { form: dayForm, enhance: dayEnhance } = superForm(
    untrack(() => data.dayForm),
    {
      id: 'day-form',
      invalidateAll: true,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          toast.success(result.data?.form?.message);
        }
      },
    },
  );

  function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  let filteredTemplates = $derived(
    data.activityTemplates.filter((t) => {
      if (typeFilter !== 'all' && t.activityType !== typeFilter) return false;
      if (
        searchQuery &&
        !t.nom.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    }),
  );

  function openAddSlot(dayId: string) {
    editingSlotId = null;
    slotDialogDayId = dayId;
    // Pre-fill: start where the last slot of this day ends.
    const daySlots = days.find((d) => d.id === dayId)?.slots ?? [];
    const lastSlot = daySlots.at(-1);
    slotStartTime = lastSlot?.endTime ?? '09:00';
    // Default 1h duration from start.
    const startMins = timeToMinutes(slotStartTime);
    const endMins = Math.min(startMins + 60, 23 * 60 + 59);
    slotEndTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
    slotActivityTemplateId = '';
    slotNom = '';
    slotActivityType = 'orga';
    searchQuery = '';
    typeFilter = 'all';
    slotDialogOpen = true;
  }

  function openAddSlotAtTime(dayId: string, time: string) {
    editingSlotId = null;
    slotDialogDayId = dayId;
    slotStartTime = time;
    const startMins = timeToMinutes(time);
    const endMins = Math.min(startMins + 60, 23 * 60 + 59);
    slotEndTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
    slotActivityTemplateId = '';
    slotNom = '';
    slotActivityType = 'orga';
    searchQuery = '';
    typeFilter = 'all';
    slotDialogOpen = true;
  }

  function handleSlotClick(slotId: string, dayId: string) {
    const day = days.find((d) => d.id === dayId);
    const slot = day?.slots.find((s) => s.id === slotId);
    if (slot) openEditSlot(slot, dayId);
  }

  function openEditSlot(slot: any, dayId: string) {
    editingSlotId = slot.id;
    slotDialogDayId = dayId;
    slotStartTime = slot.startTime;
    slotEndTime = slot.endTime;
    slotActivityTemplateId = slot.activityTemplateId ?? '';
    slotNom = slot.nom ?? '';
    slotActivityType = slot.activityType;
    searchQuery = '';
    typeFilter = 'all';
    slotDialogOpen = true;
  }

  function selectTemplate(id: string, nom: string) {
    slotActivityTemplateId = id;
    slotNom = nom;
  }

  function clearTemplate() {
    slotActivityTemplateId = '';
    slotNom = '';
  }

  function confirmDeleteSlot(id: string) {
    slotToDelete = id;
    deleteSlotOpen = true;
  }

  function openDuplicate(sourceDayId: string) {
    duplicateSourceId = sourceDayId;
    duplicateTargetId = '';
    duplicateOpen = true;
  }

  $effect(() => {
    $slotForm.startTime = slotStartTime;
    $slotForm.endTime = slotEndTime;
    $slotForm.activityTemplateId = slotActivityTemplateId;
    $slotForm.nom = slotNom;
    $slotForm.activityType = slotActivityType;
    $slotForm.planningTemplateDayId = slotDialogDayId;
  });
</script>

<svelte:head>
  <title>{data.planningTemplate.nom}</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center gap-4">
    <a
      href={resolve('/staff/admin/planning-templates')}
      class={buttonVariants({ variant: 'ghost', size: 'icon' })}
    >
      <ArrowLeft class="h-4 w-4" />
    </a>
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        {pt.nom}<span class="text-epi-pink">_</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        {pt.nbDays} jour{pt.nbDays > 1 ? 's' : ''}
        {#if pt.description}
          — {pt.description}
        {/if}
      </p>
    </div>
  </div>

  <!-- Day Tabs -->
  <Tabs.Root bind:value={activeDay}>
    <Tabs.List>
      {#each days as day}
        <Tabs.Trigger value={String(day.dayIndex)} class="gap-1.5">
          <span class="font-bold">J{day.dayIndex + 1}</span>
          {#if day.label}
            <span class="hidden text-xs text-muted-foreground sm:inline">
              {day.label}
            </span>
          {/if}
          <Badge variant="secondary" class="ml-1 text-[10px]">
            {day.slots.length}
          </Badge>
        </Tabs.Trigger>
      {/each}
    </Tabs.List>

    {#each days as day}
      <Tabs.Content value={String(day.dayIndex)} class="mt-4 space-y-4">
        <div class="flex items-center gap-3">
          <form
            method="POST"
            action="?/updateDay"
            use:dayEnhance
            class="flex items-center gap-2"
          >
            <input type="hidden" name="dayId" value={day.id} />
            <Input
              name="label"
              value={day.label || ''}
              placeholder="Label du jour (ex: Découverte Web)"
              class="w-64"
            />
            <Button type="submit" variant="outline" size="sm">Renommer</Button>
          </form>

          <div class="ml-auto flex gap-2">
            {#if days.length > 1}
              <Button
                variant="outline"
                size="sm"
                class="gap-1.5"
                onclick={() => openDuplicate(day.id)}
              >
                <Copy class="h-3.5 w-3.5" />
                Dupliquer vers...
              </Button>
            {/if}
            <Button
              variant="outline"
              size="sm"
              class="gap-1.5"
              onclick={() => openAddSlot(day.id)}
            >
              <Plus class="h-3.5 w-3.5" />
              Ajouter un créneau
            </Button>
          </div>
        </div>

        {#if day.slots.length === 0}
          <EmptyState
            icon={Clock}
            title="Aucun créneau"
            description="Ajoutez des créneaux horaires pour structurer cette journée."
            actionLabel="Ajouter un créneau"
            actionCallback={() => openAddSlot(day.id)}
          />
        {:else}
          <TemplateTimeline
            slots={day.slots}
            onSlotClick={(id) => handleSlotClick(id, day.id)}
            onEmptyClick={(time) => openAddSlotAtTime(day.id, time)}
          />
        {/if}
      </Tabs.Content>
    {/each}
  </Tabs.Root>
</div>

<!-- Slot Dialog (create + edit) -->
<Dialog.Root bind:open={slotDialogOpen}>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>
        {editingSlotId ? 'Modifier le créneau' : 'Ajouter un créneau'}
      </Dialog.Title>
      <Dialog.Description>
        Un créneau = une activité. Choisissez un template ou définissez une
        activité inline.
      </Dialog.Description>
    </Dialog.Header>

    <form
      method="POST"
      action={editingSlotId ? '?/updateSlot' : '?/addSlot'}
      use:slotEnhance
      class="grid gap-4 py-4"
    >
      {#if editingSlotId}
        <input type="hidden" name="slotId" value={editingSlotId} />
      {/if}
      <input
        type="hidden"
        name="planningTemplateDayId"
        value={slotDialogDayId}
      />
      <input
        type="hidden"
        name="activityTemplateId"
        value={slotActivityTemplateId}
      />
      <input type="hidden" name="nom" value={slotNom} />
      <input type="hidden" name="activityType" value={slotActivityType} />

      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label>Début</Label>
          <TimePicker name="startTime" bind:value={slotStartTime} />
        </div>
        <div class="grid gap-2">
          <Label>Fin</Label>
          <TimePicker name="endTime" bind:value={slotEndTime} />
        </div>
      </div>

      <Tabs.Root
        value={slotActivityTemplateId ? 'template' : 'inline'}
        onValueChange={(v) => {
          if (v === 'inline') {
            slotActivityTemplateId = '';
            slotNom = '';
          }
        }}
      >
        <Tabs.List class="grid w-full grid-cols-2">
          <Tabs.Trigger value="template">Depuis un template</Tabs.Trigger>
          <Tabs.Trigger value="inline">Activité inline</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="template" class="mt-4">
          {#if slotActivityTemplateId}
            {@const tpl = data.activityTemplates.find(
              (t) => t.id === slotActivityTemplateId,
            )}
            {#if tpl}
              <div
                class="mb-3 flex items-center justify-between rounded-md border bg-muted/30 p-3"
              >
                <div class="flex items-center gap-2">
                  {#if tpl.isDynamic}
                    <Zap class="h-4 w-4 text-epi-orange" />
                  {:else}
                    <FileText class="h-4 w-4 text-muted-foreground" />
                  {/if}
                  <span class="text-sm font-bold">{tpl.nom}</span>
                  <Badge variant="outline" class="text-[10px]">
                    {activityTypeLabels[tpl.activityType]}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onclick={clearTemplate}
                >
                  Changer
                </Button>
              </div>
            {/if}
          {:else}
            <div class="mb-3 flex gap-2">
              <div class="relative flex-1">
                <Search
                  class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground"
                />
                <Input
                  placeholder="Rechercher..."
                  class="pl-9"
                  bind:value={searchQuery}
                />
              </div>
              <Select.Root type="single" bind:value={typeFilter}>
                <Select.Trigger class="w-40">
                  {typeFilter === 'all'
                    ? 'Tous les types'
                    : activityTypeLabels[
                        typeFilter as keyof typeof activityTypeLabels
                      ] || typeFilter}
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="all">Tous les types</Select.Item>
                  {#each Object.entries(activityTypeLabels) as [value, label]}
                    <Select.Item {value}>{label}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>

            <ScrollArea class="h-60 rounded-md border bg-muted/10">
              {#if filteredTemplates.length === 0}
                <div
                  class="flex h-full items-center justify-center py-12 text-center text-sm text-muted-foreground"
                >
                  Aucun template trouvé.
                </div>
              {:else}
                <div class="space-y-1 p-2">
                  {#each filteredTemplates as template}
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 rounded-md border bg-card p-2 text-left shadow-sm transition-colors hover:border-epi-blue hover:bg-muted/50 dark:shadow-none"
                      onclick={() => selectTemplate(template.id, template.nom)}
                    >
                      {#if template.isDynamic}
                        <Zap class="h-3.5 w-3.5 shrink-0 text-epi-orange" />
                      {:else}
                        <FileText
                          class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        />
                      {/if}
                      <span class="flex-1 truncate text-sm font-medium"
                        >{template.nom}</span
                      >
                      <Badge variant="outline" class="text-[10px]">
                        {activityTypeLabels[template.activityType]}
                      </Badge>
                    </button>
                  {/each}
                </div>
              {/if}
            </ScrollArea>
          {/if}
        </Tabs.Content>

        <Tabs.Content value="inline" class="mt-4 grid gap-3">
          <div class="grid gap-2">
            <Label>Nom</Label>
            <Input bind:value={slotNom} placeholder="Ex: Pause déjeuner" />
          </div>
          <div class="grid gap-2">
            <Label>Type</Label>
            <Select.Root type="single" bind:value={slotActivityType}>
              <Select.Trigger>
                {activityTypeLabels[slotActivityType]}
              </Select.Trigger>
              <Select.Content>
                {#each activityTypes as t}
                  <Select.Item value={t}>{activityTypeLabels[t]}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </Tabs.Content>
      </Tabs.Root>

      <Dialog.Footer>
        <Button type="submit" class="bg-epi-pink text-white">
          {editingSlotId ? 'Mettre à jour' : 'Ajouter'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<!-- Duplicate Day Dialog -->
<Dialog.Root bind:open={duplicateOpen}>
  <Dialog.Content class="sm:max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Dupliquer les créneaux</Dialog.Title>
      <Dialog.Description>
        Le contenu existant du jour cible sera remplacé.
      </Dialog.Description>
    </Dialog.Header>
    <form
      method="POST"
      action="?/duplicateDay"
      use:kitEnhance={() => {
        return async ({ result, update }) => {
          if (result.type === 'success') {
            duplicateOpen = false;
            toast.success('Jour dupliqué !');
            await update();
          } else {
            toast.error('Erreur lors de la duplication.');
            await update();
          }
        };
      }}
      class="grid gap-4 py-4"
    >
      <input type="hidden" name="sourceDayId" value={duplicateSourceId} />

      <div class="grid gap-2">
        <Label>Vers quel jour ?</Label>
        <Select.Root type="single" bind:value={duplicateTargetId}>
          <Select.Trigger>
            {#if duplicateTargetId}
              {(() => {
                const d = days.find((d) => d.id === duplicateTargetId);
                return d
                  ? `Jour ${d.dayIndex + 1}${d.label ? ` — ${d.label}` : ''}`
                  : 'Sélectionner';
              })()}
            {:else}
              Sélectionner un jour
            {/if}
          </Select.Trigger>
          <Select.Content>
            {#each days.filter((d) => d.id !== duplicateSourceId) as day}
              <Select.Item value={day.id}>
                Jour {day.dayIndex + 1}{day.label ? ` — ${day.label}` : ''}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <input type="hidden" name="targetDayId" value={duplicateTargetId} />
      </div>

      <Dialog.Footer>
        <Button
          type="submit"
          disabled={!duplicateTargetId}
          class="bg-epi-pink text-white"
        >
          Dupliquer
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<ConfirmDeleteDialog
  bind:open={deleteSlotOpen}
  action="?/deleteSlot&id={slotToDelete}"
  title="Supprimer ce créneau ?"
  description="L'activité associée sera également supprimée."
/>
