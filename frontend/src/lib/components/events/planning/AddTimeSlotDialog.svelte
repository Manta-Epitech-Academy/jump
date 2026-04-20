<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { LoaderCircle, Clock, Tag } from '@lucide/svelte';
  import { superForm } from 'sveltekit-superforms';
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { onErrorToast } from '$lib/utils/formErrors';
  import type { TimeSlotWithActivities } from '$lib/types';

  let {
    open = $bindable(false),
    tsForm: tsFormData,
    editingSlot = null,
    slotDate = '',
    defaultStartTime = '09:00',
    defaultEndTime = '10:00',
  }: {
    open: boolean;
    tsForm: any;
    editingSlot?: TimeSlotWithActivities | null;
    slotDate?: string;
    defaultStartTime?: string;
    defaultEndTime?: string;
  } = $props();

  const formId = untrack(() =>
    editingSlot ? `edit-timeslot-${editingSlot.id}` : 'create-timeslot',
  );

  const { form, errors, enhance, delayed } = superForm(
    untrack(() => tsFormData),
    {
      id: formId,
      invalidateAll: true,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          open = false;
          toast.success(result.data?.form?.message || 'Créneau sauvegardé !');
        }
      },
      onError: onErrorToast(),
    },
  );

  const hours = Array.from({ length: 24 }, (_, i) =>
    String(i).padStart(2, '0'),
  );
  const minutes = Array.from({ length: 12 }, (_, i) =>
    String(i * 5).padStart(2, '0'),
  );

  let startHour = $state('09');
  let startMinute = $state('00');
  let endHour = $state('10');
  let endMinute = $state('00');

  $effect(() => {
    if (editingSlot) {
      const start = new Date(editingSlot.startTime);
      const end = new Date(editingSlot.endTime);
      startHour = String(start.getHours()).padStart(2, '0');
      startMinute = String(Math.round(start.getMinutes() / 5) * 5).padStart(
        2,
        '0',
      );
      endHour = String(end.getHours()).padStart(2, '0');
      endMinute = String(Math.round(end.getMinutes() / 5) * 5).padStart(2, '0');
      $form.label = editingSlot.label || '';
    } else if (open && !editingSlot) {
      const [sh, sm] = defaultStartTime.split(':');
      startHour = sh || '09';
      startMinute = sm || '00';
      const [eh, em] = defaultEndTime.split(':');
      endHour = eh || '10';
      endMinute = em || '00';
      $form.label = '';
    }
  });

  $effect(() => {
    $form.startTime = `${startHour}:${startMinute}`;
    $form.endTime = `${endHour}:${endMinute}`;
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="font-heading text-xl tracking-tight uppercase"
        >{editingSlot
          ? 'Modifier le créneau'
          : 'Ajouter un créneau'}</Dialog.Title
      >
      <Dialog.Description>
        {editingSlot
          ? 'Modifiez les horaires et le label du créneau.'
          : 'Définissez les horaires du nouveau créneau.'}
      </Dialog.Description>
    </Dialog.Header>

    <form
      method="POST"
      action={editingSlot ? '?/updateTimeSlot' : '?/createTimeSlot'}
      use:enhance
      class="grid gap-6"
    >
      {#if editingSlot}
        <input type="hidden" name="timeSlotId" value={editingSlot.id} />
      {/if}
      <input type="hidden" name="startTime" value={$form.startTime} />
      <input type="hidden" name="endTime" value={$form.endTime} />
      <input type="hidden" name="slotDate" value={slotDate} />

      <!-- GROUP 1: Time range -->
      <div class="space-y-4 rounded-lg border bg-muted/30 p-4 dark:bg-muted/10">
        <div
          class="mb-1 flex items-center gap-2 text-xs font-bold tracking-widest text-epi-blue uppercase"
        >
          <Clock class="h-3 w-3" /> Horaires
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="grid gap-2">
            <Label>Début</Label>
            <div class="flex items-center gap-2">
              <Select.Root type="single" bind:value={startHour}>
                <Select.Trigger class="bg-background">
                  {startHour}h
                </Select.Trigger>
                <Select.Content class="max-h-40">
                  {#each hours as h}
                    <Select.Item value={h}>{h}h</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <Select.Root type="single" bind:value={startMinute}>
                <Select.Trigger class="bg-background">
                  {startMinute}
                </Select.Trigger>
                <Select.Content>
                  {#each minutes as m}
                    <Select.Item value={m}>{m}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
            {#if $errors.startTime}
              <span class="text-xs text-destructive">{$errors.startTime}</span>
            {/if}
          </div>
          <div class="grid gap-2">
            <Label>Fin</Label>
            <div class="flex items-center gap-2">
              <Select.Root type="single" bind:value={endHour}>
                <Select.Trigger class="bg-background">
                  {endHour}h
                </Select.Trigger>
                <Select.Content class="max-h-40">
                  {#each hours as h}
                    <Select.Item value={h}>{h}h</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <Select.Root type="single" bind:value={endMinute}>
                <Select.Trigger class="bg-background">
                  {endMinute}
                </Select.Trigger>
                <Select.Content>
                  {#each minutes as m}
                    <Select.Item value={m}>{m}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
            {#if $errors.endTime}
              <span class="text-xs text-destructive">{$errors.endTime}</span>
            {/if}
          </div>
        </div>
      </div>

      <!-- GROUP 2: Label -->
      <div class="space-y-4 rounded-lg border bg-muted/30 p-4 dark:bg-muted/10">
        <div
          class="mb-1 flex items-center gap-2 text-xs font-bold tracking-widest text-epi-blue uppercase"
        >
          <Tag class="h-3 w-3" /> Informations
        </div>
        <div class="grid gap-2">
          <Label
            >Label <span class="text-muted-foreground">(optionnel)</span></Label
          >
          <Input
            name="label"
            bind:value={$form.label}
            placeholder="Ex: Pause déjeuner, Keynote..."
            class="bg-background"
          />
          {#if $errors.label}
            <span class="text-xs text-destructive">{$errors.label}</span>
          {/if}
        </div>
      </div>

      <Dialog.Footer>
        <Button
          type="submit"
          disabled={$delayed}
          class="w-full bg-epi-blue text-white shadow-md hover:bg-epi-blue/90 dark:shadow-none"
        >
          {#if $delayed}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
            Enregistrement...
          {:else}
            {editingSlot ? 'Mettre à jour' : 'Ajouter le créneau'}
          {/if}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
