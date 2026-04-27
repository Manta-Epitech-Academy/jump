<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { enhance } from '$app/forms';
  import { today, type DateValue } from '@internationalized/date';
  import { CalendarClock, Check } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Popover from '$lib/components/ui/popover';
  import { Label } from '$lib/components/ui/label';
  import { TimePicker } from '$lib/components/ui/time-picker';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { toast } from 'svelte-sonner';

  let {
    action,
    participationId = null,
    timezone,
    defaultTime = '14:00',
    trigger,
    label = 'Planifier un entretien',
    size = 'sm',
  }: {
    action: string;
    participationId?: string | null;
    timezone: string;
    defaultTime?: string;
    trigger?: Snippet<[{ props: Record<string, unknown> }]>;
    label?: string;
    size?: 'sm' | 'default';
  } = $props();

  let open = $state(false);
  let date = $state<DateValue | undefined>(untrack(() => today(timezone)));
  let time = $state(untrack(() => defaultTime));
  let submitting = $state(false);

  function resetToDefaults() {
    date = today(timezone);
    time = defaultTime;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      {#if trigger}
        {@render trigger({ props })}
      {:else}
        <Button {size} variant="outline" class="gap-2" {...props}>
          <CalendarClock class="h-4 w-4" />
          {label}
        </Button>
      {/if}
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-80 space-y-3 p-4" align="end">
    <div class="font-heading text-sm tracking-wider uppercase">
      Planifier un entretien
    </div>
    <form
      {action}
      method="POST"
      use:enhance={() => {
        submitting = true;
        return async ({ result, update }) => {
          submitting = false;
          if (result.type === 'success') {
            toast.success('Entretien planifié');
            open = false;
            resetToDefaults();
          } else if (result.type === 'failure') {
            toast.error("Impossible de planifier l'entretien");
          }
          await update();
        };
      }}
      class="space-y-3"
    >
      {#if participationId}
        <input type="hidden" name="participationId" value={participationId} />
      {/if}
      <div class="space-y-1.5">
        <Label for="interview-date" class="text-xs uppercase">Date</Label>
        <DatePicker bind:value={date} name="date" />
      </div>
      <div class="space-y-1.5">
        <Label for="interview-time" class="text-xs uppercase">Heure</Label>
        <TimePicker
          id="interview-time"
          name="time"
          bind:value={time}
          required
        />
      </div>
      <Button
        type="submit"
        size="sm"
        class="w-full gap-2"
        disabled={submitting || !date || !time}
      >
        <Check class="h-4 w-4" /> Confirmer
      </Button>
    </form>
  </Popover.Content>
</Popover.Root>
