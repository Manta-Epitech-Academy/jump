<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Select from '$lib/components/ui/select';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { Separator } from '$lib/components/ui/separator';
  import { Settings, Trash2 } from '@lucide/svelte';
  import { buttonVariants } from '$lib/components/ui/button';
  import ThemeSelect from '$lib/components/ThemeSelect.svelte';
  import MultiStaffSelect from '../../../components/MultiStaffSelect.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { CalendarDateTime } from '@internationalized/date';
  import type { Readable } from 'svelte/store';
  import type { ThemesResponse, UsersResponse } from '$lib/pocketbase-types';
  import type { SuperForm } from 'sveltekit-superforms/client';
  import type { EventForm } from '$lib/validation/events';

  let {
    open = $bindable(false),
    deleteEventDialogOpen = $bindable(false),
    editForm,
    editErrors,
    editEnhance,
    editDelayed,
    themes,
    staff,
  }: {
    open: boolean;
    deleteEventDialogOpen: boolean;
    editForm: SuperForm<EventForm>['form'];
    editErrors: SuperForm<EventForm>['errors'];
    editEnhance: SuperForm<EventForm>['enhance'];
    editDelayed: Readable<boolean>;
    themes: ThemesResponse[];
    staff: UsersResponse[];
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
</script>

<Dialog.Root bind:open>
  <Tooltip.Provider delayDuration={300}>
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props: tooltipProps })}
          <Dialog.Trigger
            {...tooltipProps}
            class={buttonVariants({ variant: 'outline', size: 'icon' })}
          >
            <Settings class="h-4 w-4" />
          </Dialog.Trigger>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content><p>Paramètres de l'événement</p></Tooltip.Content>
    </Tooltip.Root>
  </Tooltip.Provider>

  <Dialog.Content class="sm:max-w-125">
    <Dialog.Header>
      <Dialog.Title>Paramètres de l'événement</Dialog.Title>
    </Dialog.Header>
    <div class="space-y-6">
      <form
        method="POST"
        action="?/updateEvent"
        use:editEnhance
        class="space-y-4 py-2"
      >
        <div class="space-y-2">
          <Label>Titre</Label>
          <Input name="titre" bind:value={$editForm.titre} />
          {#if $editErrors.titre}<p class="text-xs text-destructive">
              {$editErrors.titre}
            </p>{/if}
        </div>

        <div class="space-y-2">
          <Label>Notes & Planning</Label>
          <Textarea
            name="notes"
            bind:value={$editForm.notes}
            placeholder="Ex: 14h00 Intro, 15h30 Pause... Attention aux élèves de 4ème sur les boucles."
            class="min-h-25"
          />
          {#if $editErrors.notes}<p class="text-xs text-destructive">
              {$editErrors.notes}
            </p>{/if}
        </div>

        <div class="grid gap-4">
          <div class="space-y-2">
            <Label>Thème</Label>
            <ThemeSelect {themes} bind:value={$editForm.theme} name="theme" />
            {#if $editErrors.theme}<p class="text-xs text-destructive">
                {$editErrors.theme}
              </p>{/if}
          </div>
          <div class="space-y-2">
            <Label>Mantas</Label>
            <MultiStaffSelect
              {staff}
              bind:value={$editForm.mantas}
              name="mantas"
            />
            {#if $editErrors.mantas}<p class="text-xs text-destructive">
                {$editErrors.mantas}
              </p>{/if}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label>Date</Label>
            <DatePicker bind:value={dateValue} name="date" />
            {#if $editErrors.date}<p class="text-xs text-destructive">
                {$editErrors.date}
              </p>{/if}
          </div>
          <div class="space-y-2">
            <Label>Heure</Label>
            <div class="flex gap-2">
              <Select.Root type="single" bind:value={hour}>
                <Select.Trigger>{hour}</Select.Trigger>
                <Select.Content class="h-50">
                  {#each hours as h}<Select.Item value={h}>{h}</Select.Item
                    >{/each}
                </Select.Content>
              </Select.Root>
              <Select.Root type="single" bind:value={minute}>
                <Select.Trigger>{minute}</Select.Trigger>
                <Select.Content>
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

        <div class="flex justify-end pt-4">
          <Button type="submit" disabled={$editDelayed}
            >Sauvegarder les modifications</Button
          >
        </div>
      </form>

      <Separator />

      <div
        class="space-y-4 rounded-sm border border-destructive/20 bg-destructive/5 p-4"
      >
        <div class="space-y-1">
          <h4 class="text-sm font-bold text-destructive uppercase">
            Zone de danger
          </h4>
          <p class="text-xs text-muted-foreground">
            La suppression d'un événement est irréversible. Les XP des élèves
            validés seront automatiquement retirés.
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          class="w-full"
          onclick={() => (deleteEventDialogOpen = true)}
        >
          <Trash2 class="mr-2 h-4 w-4" />
          Supprimer définitivement l'événement
        </Button>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
