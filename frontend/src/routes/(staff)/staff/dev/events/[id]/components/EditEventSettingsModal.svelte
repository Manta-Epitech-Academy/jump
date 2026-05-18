<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import ThemeSelect from '$lib/components/ThemeSelect.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { CalendarDateTime } from '@internationalized/date';
  import type { Readable } from 'svelte/store';
  import type { SuperForm } from 'sveltekit-superforms/client';
  import type { EventForm } from '$lib/validation/events';

  let {
    open = $bindable(false),
    editForm,
    editErrors,
    editEnhance,
    editDelayed,
    themes,
  }: {
    open: boolean;
    editForm: SuperForm<EventForm>['form'];
    editErrors: SuperForm<EventForm>['errors'];
    editEnhance: SuperForm<EventForm>['enhance'];
    editDelayed: Readable<boolean>;
    themes: any[];
  } = $props();

  function parseInitialDate(val: any) {
    if (!val) return undefined;
    try {
      const dateStr = typeof val === 'string' ? val : val.toString();
      const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
      return new CalendarDateTime(y, m, d);
    } catch (e) {
      return undefined;
    }
  }

  let dateValue = $state<CalendarDateTime | undefined>(
    parseInitialDate($editForm.date),
  );
  let endDateValue = $state<CalendarDateTime | undefined>(
    parseInitialDate($editForm.endDate),
  );
  const hours = Array.from({ length: 24 }, (_, i) =>
    String(i).padStart(2, '0'),
  );
  const minutes = Array.from({ length: 12 }, (_, i) =>
    String(i * 5).padStart(2, '0'),
  );
  let hour = $state($editForm.time?.split(':')[0] || '14');
  let minute = $state($editForm.time?.split(':')[1] || '00');

  $effect(() => {
    if (dateValue) {
      const y = dateValue.year;
      const m = String(dateValue.month).padStart(2, '0');
      const d = String(dateValue.day).padStart(2, '0');
      const newDateStr = `${y}-${m}-${d}`;
      if ($editForm.date !== newDateStr) $editForm.date = newDateStr;
    }
    const newTime = `${hour}:${minute}`;
    if ($editForm.time !== newTime) $editForm.time = newTime;
  });

  $effect(() => {
    if (endDateValue) {
      const y = endDateValue.year;
      const m = String(endDateValue.month).padStart(2, '0');
      const d = String(endDateValue.day).padStart(2, '0');
      const newEndDateStr = `${y}-${m}-${d}`;
      if ($editForm.endDate !== newEndDateStr)
        $editForm.endDate = newEndDateStr;
    } else {
      if ($editForm.endDate !== '') $editForm.endDate = '';
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="rounded-sm sm:max-w-125">
    <Dialog.Header>
      <Dialog.Title class="text-lg font-bold tracking-tight uppercase"
        >Paramètres de l'événement</Dialog.Title
      >
    </Dialog.Header>
    <div class="space-y-6">
      <form
        method="POST"
        action="?/updateEvent"
        use:editEnhance
        class="space-y-4 py-2"
      >
        <!-- GROUP 1: General Info -->
        <div class="space-y-4 rounded-sm border bg-muted/10 p-5">
          <div class="space-y-2">
            <Label class="text-[10px] font-bold tracking-widest uppercase"
              >Notes & Planning</Label
            >
            <Textarea
              name="notes"
              bind:value={$editForm.notes}
              placeholder="Ex: 14h00 Intro, 15h30 Pause..."
              class="min-h-25 rounded-sm bg-background"
            />
            {#if $editErrors.notes}<p class="text-xs text-destructive">
                {$editErrors.notes}
              </p>{/if}
          </div>
        </div>

        <!-- GROUP 2: Classification & Staffing -->
        <div class="space-y-4 rounded-sm border bg-muted/10 p-5">
          <div class="grid gap-4">
            <div class="space-y-2">
              <Label class="text-[10px] font-bold tracking-widest uppercase"
                >Thème</Label
              >
              <div class="rounded-sm bg-background">
                <ThemeSelect
                  {themes}
                  bind:value={$editForm.theme}
                  name="theme"
                />
              </div>
              {#if $editErrors.theme}<p class="text-xs text-destructive">
                  {$editErrors.theme}
                </p>{/if}
            </div>
          </div>
        </div>

        <!-- GROUP 3: Scheduling -->
        <div class="space-y-4 rounded-sm border bg-muted/10 p-5">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label class="text-[10px] font-bold tracking-widest uppercase"
                >Date de début</Label
              >
              <div class="rounded-sm bg-background">
                <DatePicker
                  bind:value={dateValue}
                  name="date"
                  class="rounded-sm"
                />
              </div>
              {#if $editErrors.date}<p class="text-xs text-destructive">
                  {$editErrors.date}
                </p>{/if}
            </div>
            <div class="space-y-2">
              <Label class="text-[10px] font-bold tracking-widest uppercase"
                >Heure</Label
              >
              <div class="flex gap-2">
                <Select.Root type="single" bind:value={hour}>
                  <Select.Trigger class="rounded-sm bg-background"
                    >{hour}</Select.Trigger
                  >
                  <Select.Content class="h-50 rounded-sm">
                    {#each hours as h}<Select.Item value={h}>{h}</Select.Item
                      >{/each}
                  </Select.Content>
                </Select.Root>
                <Select.Root type="single" bind:value={minute}>
                  <Select.Trigger class="rounded-sm bg-background"
                    >{minute}</Select.Trigger
                  >
                  <Select.Content class="rounded-sm">
                    {#each minutes as m}<Select.Item value={m}>{m}</Select.Item
                      >{/each}
                  </Select.Content>
                </Select.Root>
              </div>
              <input type="hidden" name="time" value={$editForm.time} />
              {#if $editErrors.time}<p class="text-xs text-destructive">
                  {$editErrors.time}
                </p>{/if}
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label class="text-[10px] font-bold tracking-widest uppercase"
                >Date de fin <span class="text-muted-foreground normal-case"
                  >(optionnel)</span
                ></Label
              >
              <div class="rounded-sm bg-background">
                <DatePicker
                  bind:value={endDateValue}
                  name="endDate"
                  class="rounded-sm"
                />
              </div>
              {#if $editErrors.endDate}<p class="text-xs text-destructive">
                  {$editErrors.endDate}
                </p>{/if}
            </div>
          </div>
        </div>

        <div class="flex justify-end pt-4">
          <Button
            type="submit"
            disabled={$editDelayed}
            class="rounded-sm bg-epi-blue text-white shadow-sm hover:bg-epi-blue/90"
          >
            {#if $editDelayed}
              <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
              Sauvegarde...
            {:else}
              Sauvegarder
            {/if}
          </Button>
        </div>
      </form>
    </div>
  </Dialog.Content>
</Dialog.Root>
