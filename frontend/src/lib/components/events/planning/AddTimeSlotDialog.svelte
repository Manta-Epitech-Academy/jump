<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import { superForm } from 'sveltekit-superforms';
  import { untrack } from 'svelte';
  import { toast } from 'svelte-sonner';
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
      <Dialog.Title
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
      class="grid gap-4"
    >
      {#if editingSlot}
        <input type="hidden" name="timeSlotId" value={editingSlot.id} />
      {/if}
      <input type="hidden" name="startTime" value={$form.startTime} />
      <input type="hidden" name="endTime" value={$form.endTime} />
      <input type="hidden" name="slotDate" value={slotDate} />

      <div class="grid gap-2">
        <Label>Heure de début</Label>
        <div class="flex items-center gap-2">
          <Select.Root type="single" bind:value={startHour}>
            <Select.Trigger class="w-20">
              {startHour}h
            </Select.Trigger>
            <Select.Content class="max-h-40">
              {#each hours as h}
                <Select.Item value={h}>{h}h</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <span class="text-muted-foreground">:</span>
          <Select.Root type="single" bind:value={startMinute}>
            <Select.Trigger class="w-20">
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
        <Label>Heure de fin</Label>
        <div class="flex items-center gap-2">
          <Select.Root type="single" bind:value={endHour}>
            <Select.Trigger class="w-20">
              {endHour}h
            </Select.Trigger>
            <Select.Content class="max-h-40">
              {#each hours as h}
                <Select.Item value={h}>{h}h</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <span class="text-muted-foreground">:</span>
          <Select.Root type="single" bind:value={endMinute}>
            <Select.Trigger class="w-20">
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

      <div class="grid gap-2">
        <Label
          >Label <span class="text-muted-foreground">(optionnel)</span></Label
        >
        <Input
          name="label"
          bind:value={$form.label}
          placeholder="Ex: Pause déjeuner, Keynote..."
        />
        {#if $errors.label}
          <span class="text-xs text-destructive">{$errors.label}</span>
        {/if}
      </div>

      <Dialog.Footer>
        <Button
          type="submit"
          disabled={$delayed}
          class="bg-epi-blue text-white hover:bg-epi-blue/90"
        >
          {$delayed
            ? 'Enregistrement...'
            : editingSlot
              ? 'Mettre à jour'
              : 'Ajouter'}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
