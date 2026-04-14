<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm } from 'sveltekit-superforms';
  import { enhance as kitEnhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import {
    ArrowLeft,
    Plus,
    Trash2,
    Pencil,
    Copy,
    Search,
    Clock,
    Zap,
    FileText,
  } from '@lucide/svelte';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Select from '$lib/components/ui/select';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import ConfirmDeleteDialog from '$lib/components/ConfirmDeleteDialog.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import { toast } from 'svelte-sonner';
  import { activityTypeLabels } from '$lib/validation/templates';

  let { data } = $props();

  const pt = $derived(data.planningTemplate);
  const days = $derived(pt.days);

  // Day tab state
  let activeDay = $state('0');

  // Slot dialog
  let addSlotOpen = $state(false);
  let addSlotDayId = $state('');
  let editSlotOpen = $state(false);
  let editSlotId = $state('');

  // Item dialog
  let addItemOpen = $state(false);
  let addItemSlotId = $state('');

  // Duplicate dialog
  let duplicateOpen = $state(false);
  let duplicateSourceId = $state('');
  let duplicateTargetId = $state('');

  // Delete dialog
  let deleteSlotOpen = $state(false);
  let slotToDelete = $state<string | null>(null);
  let deleteItemOpen = $state(false);
  let itemToDelete = $state<string | null>(null);

  // Slot form
  const {
    form: slotForm,
    errors: slotErrors,
    enhance: slotEnhance,
    delayed: slotDelayed,
    reset: slotReset,
  } = superForm(
    untrack(() => data.slotForm),
    {
      id: 'slot-form',
      invalidateAll: true,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          addSlotOpen = false;
          editSlotOpen = false;
          toast.success(result.data?.form?.message);
        }
      },
    },
  );

  // Day label form
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

  // Item template search
  let searchQuery = $state('');
  let typeFilter = $state('all');
  let isAddingItem = $state<string | null>(null);

  // Inline item state
  let inlineNom = $state('');
  let inlineDescription = $state('');
  let inlineType = $state('orga');
  let isAddingInline = $state(false);

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
    slotReset();
    addSlotDayId = dayId;
    addSlotOpen = true;
  }

  function openEditSlot(
    slot: (typeof days)[number]['slots'][number],
    dayId: string,
  ) {
    slotReset();
    $slotForm.startTime = slot.startTime;
    $slotForm.endTime = slot.endTime;
    $slotForm.label = slot.label || '';
    $slotForm.planningTemplateDayId = dayId;
    editSlotId = slot.id;
    editSlotOpen = true;
  }

  function openAddItem(slotId: string) {
    searchQuery = '';
    typeFilter = 'all';
    inlineNom = '';
    inlineDescription = '';
    inlineType = 'orga';
    addItemSlotId = slotId;
    addItemOpen = true;
  }

  function openDuplicate(sourceDayId: string) {
    duplicateSourceId = sourceDayId;
    duplicateTargetId = '';
    duplicateOpen = true;
  }

  function confirmDeleteSlot(id: string) {
    slotToDelete = id;
    deleteSlotOpen = true;
  }

  function confirmDeleteItem(id: string) {
    itemToDelete = id;
    deleteItemOpen = true;
  }

  const currentDay = $derived(
    days.find((d) => String(d.dayIndex) === activeDay),
  );
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center gap-4">
    <a
      href={resolve('/admin/planning-templates')}
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
    <div class="flex items-center justify-between">
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
    </div>

    {#each days as day}
      <Tabs.Content value={String(day.dayIndex)} class="mt-4 space-y-4">
        <!-- Day label edit -->
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

        <!-- Slots -->
        {#if day.slots.length === 0}
          <EmptyState
            icon={Clock}
            title="Aucun créneau"
            description="Ajoutez des créneaux horaires pour structurer cette journée."
            actionLabel="Ajouter un créneau"
            actionCallback={() => openAddSlot(day.id)}
          />
        {:else}
          <div class="space-y-3">
            {#each day.slots as slot}
              <div class="rounded-lg border bg-card p-4">
                <div class="mb-2 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <Badge variant="outline" class="font-mono text-sm">
                      {slot.startTime} — {slot.endTime}
                    </Badge>
                    {#if slot.label}
                      <span class="text-sm font-medium text-muted-foreground">
                        {slot.label}
                      </span>
                    {/if}
                  </div>
                  <div class="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7"
                      onclick={() => openEditSlot(slot, day.id)}
                    >
                      <Pencil class="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7 text-destructive hover:text-destructive"
                      onclick={() => confirmDeleteSlot(slot.id)}
                    >
                      <Trash2 class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <!-- Items -->
                <div class="space-y-1.5">
                  {#each slot.items as item}
                    <div
                      class="flex items-center justify-between rounded-md border border-dashed px-3 py-2"
                    >
                      <div class="flex items-center gap-2">
                        {#if item.activityTemplate}
                          {#if item.activityTemplate.isDynamic}
                            <Zap class="h-3.5 w-3.5 text-epi-orange" />
                          {:else}
                            <FileText
                              class="h-3.5 w-3.5 text-muted-foreground"
                            />
                          {/if}
                          <span class="text-sm font-medium">
                            {item.activityTemplate.nom}
                          </span>
                          <Badge variant="outline" class="text-[10px]">
                            {activityTypeLabels[
                              item.activityTemplate
                                .activityType as keyof typeof activityTypeLabels
                            ]}
                          </Badge>
                          {#if item.activityTemplate.difficulte}
                            <Badge variant="secondary" class="text-[10px]">
                              {item.activityTemplate.difficulte}
                            </Badge>
                          {/if}
                        {:else}
                          <span class="text-sm font-medium">
                            {item.nom || 'Activité statique'}
                          </span>
                          <Badge variant="outline" class="text-[10px]">
                            {activityTypeLabels[
                              item.activityType as keyof typeof activityTypeLabels
                            ]}
                          </Badge>
                        {/if}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6 text-destructive hover:text-destructive"
                        onclick={() => confirmDeleteItem(item.id)}
                      >
                        <Trash2 class="h-3 w-3" />
                      </Button>
                    </div>
                  {/each}

                  <Button
                    variant="ghost"
                    size="sm"
                    class="w-full border border-dashed text-muted-foreground"
                    onclick={() => openAddItem(slot.id)}
                  >
                    <Plus class="mr-1 h-3.5 w-3.5" />
                    Ajouter une activité
                  </Button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </Tabs.Content>
    {/each}
  </Tabs.Root>
</div>

<!-- Add Slot Dialog -->
<Dialog.Root bind:open={addSlotOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Ajouter un créneau</Dialog.Title>
    </Dialog.Header>
    <form
      method="POST"
      action="?/addSlot"
      use:slotEnhance
      class="grid gap-4 py-4"
    >
      <input type="hidden" name="planningTemplateDayId" value={addSlotDayId} />
      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label>Début</Label>
          <Input
            type="time"
            name="startTime"
            bind:value={$slotForm.startTime}
          />
          {#if $slotErrors.startTime}
            <span class="text-xs text-destructive">{$slotErrors.startTime}</span
            >
          {/if}
        </div>
        <div class="grid gap-2">
          <Label>Fin</Label>
          <Input type="time" name="endTime" bind:value={$slotForm.endTime} />
          {#if $slotErrors.endTime}
            <span class="text-xs text-destructive">{$slotErrors.endTime}</span>
          {/if}
        </div>
      </div>
      <div class="grid gap-2">
        <Label
          >Label <span class="text-muted-foreground">(optionnel)</span></Label
        >
        <Input
          name="label"
          bind:value={$slotForm.label}
          placeholder="Ex: Pause déjeuner"
        />
      </div>
      <Dialog.Footer>
        <Button
          type="submit"
          disabled={$slotDelayed}
          class="bg-epi-pink text-white"
        >
          {$slotDelayed ? 'Ajout...' : 'Ajouter'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<!-- Edit Slot Dialog -->
<Dialog.Root bind:open={editSlotOpen}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Modifier le créneau</Dialog.Title>
    </Dialog.Header>
    <form
      method="POST"
      action="?/updateSlot"
      use:slotEnhance
      class="grid gap-4 py-4"
    >
      <input type="hidden" name="slotId" value={editSlotId} />
      <input
        type="hidden"
        name="planningTemplateDayId"
        value={currentDay?.id || ''}
      />
      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label>Début</Label>
          <Input
            type="time"
            name="startTime"
            bind:value={$slotForm.startTime}
          />
          {#if $slotErrors.startTime}
            <span class="text-xs text-destructive">{$slotErrors.startTime}</span
            >
          {/if}
        </div>
        <div class="grid gap-2">
          <Label>Fin</Label>
          <Input type="time" name="endTime" bind:value={$slotForm.endTime} />
          {#if $slotErrors.endTime}
            <span class="text-xs text-destructive">{$slotErrors.endTime}</span>
          {/if}
        </div>
      </div>
      <div class="grid gap-2">
        <Label
          >Label <span class="text-muted-foreground">(optionnel)</span></Label
        >
        <Input name="label" bind:value={$slotForm.label} />
      </div>
      <Dialog.Footer>
        <Button
          type="submit"
          disabled={$slotDelayed}
          class="bg-epi-pink text-white"
        >
          {$slotDelayed ? 'Mise à jour...' : 'Mettre à jour'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<!-- Add Item Dialog -->
<Dialog.Root bind:open={addItemOpen}>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Ajouter une activité au créneau</Dialog.Title>
      <Dialog.Description>
        Choisissez un template officiel ou définissez une activité statique.
      </Dialog.Description>
    </Dialog.Header>

    <Tabs.Root value="template" class="w-full">
      <Tabs.List class="grid w-full grid-cols-2">
        <Tabs.Trigger value="template">Depuis un template</Tabs.Trigger>
        <Tabs.Trigger value="inline">Activité statique</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="template" class="mt-4">
        <div class="mb-3 flex gap-2">
          <div class="relative flex-1">
            <Search
              class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground"
            />
            <Input
              placeholder="Rechercher un template..."
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

        <ScrollArea class="h-72">
          {#if filteredTemplates.length === 0}
            <div
              class="flex items-center justify-center py-12 text-center text-sm text-muted-foreground"
            >
              Aucun template trouvé.
            </div>
          {:else}
            <div class="space-y-2 pr-3">
              {#each filteredTemplates as template}
                <div
                  class="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <div class="flex flex-1 flex-col gap-1">
                    <div class="flex items-center gap-2">
                      {#if template.isDynamic}
                        <Zap class="h-3.5 w-3.5 text-epi-orange" />
                      {:else}
                        <FileText class="h-3.5 w-3.5 text-muted-foreground" />
                      {/if}
                      <span class="text-sm font-medium">{template.nom}</span>
                    </div>
                    <div class="flex flex-wrap gap-1">
                      <Badge variant="outline" class="text-[10px]">
                        {activityTypeLabels[
                          template.activityType as keyof typeof activityTypeLabels
                        ]}
                      </Badge>
                      {#if template.difficulte}
                        <Badge variant="secondary" class="text-[10px]">
                          {template.difficulte}
                        </Badge>
                      {/if}
                      {#each template.activityTemplateThemes as att}
                        <Badge variant="secondary" class="text-[10px]">
                          #{att.theme.nom}
                        </Badge>
                      {/each}
                    </div>
                    {#if template.description}
                      <p class="line-clamp-1 text-xs text-muted-foreground">
                        {template.description}
                      </p>
                    {/if}
                  </div>
                  <form
                    method="POST"
                    action="?/addItem"
                    use:kitEnhance={() => {
                      isAddingItem = template.id;
                      return async ({ result, update }) => {
                        isAddingItem = null;
                        if (result.type === 'success') {
                          addItemOpen = false;
                          toast.success(`« ${template.nom} » ajouté !`);
                          await update();
                        } else {
                          toast.error("Erreur lors de l'ajout.");
                          await update();
                        }
                      };
                    }}
                  >
                    <input
                      type="hidden"
                      name="planningTemplateSlotId"
                      value={addItemSlotId}
                    />
                    <input
                      type="hidden"
                      name="activityTemplateId"
                      value={template.id}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={isAddingItem === template.id}
                      class="ml-3 shrink-0"
                    >
                      <Plus class="mr-1 h-3.5 w-3.5" />
                      {isAddingItem === template.id ? '...' : 'Ajouter'}
                    </Button>
                  </form>
                </div>
              {/each}
            </div>
          {/if}
        </ScrollArea>
      </Tabs.Content>

      <Tabs.Content value="inline" class="mt-4">
        <form
          method="POST"
          action="?/addItem"
          use:kitEnhance={() => {
            isAddingInline = true;
            return async ({ result, update }) => {
              isAddingInline = false;
              if (result.type === 'success') {
                addItemOpen = false;
                toast.success('Activité statique ajoutée !');
                await update();
              } else {
                toast.error("Erreur lors de l'ajout.");
                await update();
              }
            };
          }}
          class="grid gap-4"
        >
          <input
            type="hidden"
            name="planningTemplateSlotId"
            value={addItemSlotId}
          />

          <div class="grid gap-2">
            <Label>Nom</Label>
            <Input
              name="nom"
              bind:value={inlineNom}
              placeholder="Ex: Pause déjeuner"
            />
          </div>

          <div class="grid gap-2">
            <Label>Type</Label>
            <Select.Root type="single" bind:value={inlineType}>
              <Select.Trigger>
                {activityTypeLabels[
                  inlineType as keyof typeof activityTypeLabels
                ] || inlineType}
              </Select.Trigger>
              <Select.Content>
                {#each Object.entries(activityTypeLabels) as [value, label]}
                  <Select.Item {value}>{label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
            <input type="hidden" name="activityType" value={inlineType} />
          </div>

          <div class="grid gap-2">
            <Label
              >Description <span class="text-muted-foreground">(optionnel)</span
              ></Label
            >
            <Input
              name="description"
              bind:value={inlineDescription}
              placeholder="Brève description"
            />
          </div>

          <Dialog.Footer>
            <Button
              type="submit"
              disabled={isAddingInline}
              class="bg-epi-pink text-white"
            >
              {isAddingInline ? 'Ajout...' : 'Ajouter'}
            </Button>
          </Dialog.Footer>
        </form>
      </Tabs.Content>
    </Tabs.Root>
  </Dialog.Content>
</Dialog.Root>

<!-- Duplicate Day Dialog -->
<Dialog.Root bind:open={duplicateOpen}>
  <Dialog.Content class="sm:max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Dupliquer les créneaux</Dialog.Title>
      <Dialog.Description>
        Copier tous les créneaux et activités vers un autre jour. Le contenu
        existant du jour cible sera remplacé.
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

<!-- Delete confirmations -->
<ConfirmDeleteDialog
  bind:open={deleteSlotOpen}
  action="?/deleteSlot&id={slotToDelete}"
  title="Supprimer ce créneau ?"
  description="Les activités associées seront également supprimées."
/>

<ConfirmDeleteDialog
  bind:open={deleteItemOpen}
  action="?/removeItem&id={itemToDelete}"
  title="Retirer cette activité ?"
  description="L'activité sera retirée du créneau."
/>
