<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import * as Select from '$lib/components/ui/select';
  import * as Popover from '$lib/components/ui/popover';
  import { Calendar } from '$lib/components/ui/calendar';
  import { ChevronDown } from '@lucide/svelte';
  import {
    CalendarDateTime,
    getLocalTimeZone,
    today,
  } from '@internationalized/date';
  import { formatDateFr } from '$lib/utils';
  import ThemeSelect from '$lib/components/ThemeSelect.svelte';
  import MultiStaffSelect from '../../components/MultiStaffSelect.svelte';
  import type { SuperForm, Infer } from 'sveltekit-superforms';
  import type { eventSchema } from '$lib/validation/events';

  type EventSuperForm = SuperForm<Infer<typeof eventSchema>>;

  let {
    form,
    errors,
    themes,
    staff,
  }: {
    form: EventSuperForm['form'];
    errors: EventSuperForm['errors'];
    themes: any[];
    staff: any[];
  } = $props();

  let open = $state(false);
  let dateValue = $state<CalendarDateTime | undefined>();
  const hours = Array.from({ length: 24 }, (_, i) =>
    String(i).padStart(2, '0'),
  );
  const minutes = Array.from({ length: 12 }, (_, i) =>
    String(i * 5).padStart(2, '0'),
  );
  let hour = $state('14');
  let minute = $state('00');
  let timeValue = $state('14:00');

  $effect(() => {
    if (dateValue) $form.date = dateValue;
    timeValue = `${hour}:${minute}`;
    $form.time = timeValue;
  });
</script>

<div class="space-y-6">
  <div class="space-y-2">
    <Label for="titre">Titre de l'événement</Label>
    <Input
      id="titre"
      name="titre"
      bind:value={$form.titre}
      placeholder="Ex: Atelier hebdomadaire - Mercredi"
    />
    {#if $errors.titre}<p class="text-sm text-destructive">
        {$errors.titre}
      </p>{/if}
  </div>

  <div class="flex flex-col gap-4 sm:flex-row">
    <div class="flex-1 space-y-2">
      <Label for="date">Date</Label>
      <Popover.Root bind:open>
        <Popover.Trigger id="date">
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              class="w-full justify-between font-normal"
            >
              {formatDateFr(dateValue)}
              <ChevronDown class="h-4 w-4" />
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-auto overflow-hidden p-0" align="start">
          <Calendar
            type="single"
            bind:value={dateValue}
            captionLayout="dropdown"
            onValueChange={() => {
              open = false;
            }}
            minValue={today(getLocalTimeZone())}
          />
        </Popover.Content>
      </Popover.Root>
      <input
        type="hidden"
        name="date"
        value={dateValue
          ? `${dateValue.year}-${String(dateValue.month).padStart(2, '0')}-${String(dateValue.day).padStart(2, '0')}`
          : ''}
      />
      {#if $errors.date}<p class="text-sm text-destructive">
          {$errors.date}
        </p>{/if}
    </div>

    <div class="flex-1 space-y-2">
      <Label>Heure</Label>
      <div class="flex gap-2">
        <Select.Root type="single" bind:value={hour}>
          <Select.Trigger class="w-full">{hour}</Select.Trigger>
          <Select.Content class="h-50 overflow-y-auto">
            {#each hours as h (h)}<Select.Item value={h}>{h}</Select.Item
              >{/each}
          </Select.Content>
        </Select.Root>
        <span class="py-2 text-muted-foreground">:</span>
        <Select.Root type="single" bind:value={minute}>
          <Select.Trigger class="w-full">{minute}</Select.Trigger>
          <Select.Content>
            {#each minutes as m (m)}<Select.Item value={m}>{m}</Select.Item
              >{/each}
          </Select.Content>
        </Select.Root>
      </div>
      <input type="hidden" name="time" value={timeValue} />
    </div>
  </div>

  <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
    <div class="space-y-2">
      <Label for="theme">Thème (Optionnel)</Label>
      <ThemeSelect {themes} bind:value={$form.theme} name="theme" />
      <p class="text-[10px] font-bold text-muted-foreground uppercase">
        Sélectionnez un thème existant ou tapez-en un nouveau pour le créer.
      </p>
      {#if $errors.theme}<p class="text-sm text-destructive">
          {$errors.theme}
        </p>{/if}
    </div>
    <div class="space-y-2">
      <Label>Mantas</Label>
      <MultiStaffSelect {staff} bind:value={$form.mantas} name="mantas" />
      <p class="text-[10px] font-bold text-muted-foreground uppercase">
        Staff assigné à l'encadrement de cet événement.
      </p>
      {#if $errors.mantas}<p class="text-sm text-destructive">
          {$errors.mantas}
        </p>{/if}
    </div>
  </div>

  <div class="space-y-2">
    <Label for="notes">Notes & Planning</Label>
    <Textarea
      id="notes"
      name="notes"
      bind:value={$form.notes}
      placeholder="Planning, instructions, ou notes spécifiques..."
      class="min-h-25"
    />
    {#if $errors.notes}<p class="text-sm text-destructive">
        {$errors.notes}
      </p>{/if}
  </div>
</div>
