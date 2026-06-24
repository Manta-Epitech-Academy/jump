<script lang="ts">
  import CalendarIcon from '@lucide/svelte/icons/calendar';
  import Clock from '@lucide/svelte/icons/clock';
  import {
    CalendarDate,
    type DateValue,
    getLocalTimeZone,
    today,
  } from '@internationalized/date';
  import { cn } from '$lib/utils';
  import { Button } from '$lib/components/ui/button';
  import { Calendar } from '$lib/components/ui/calendar';
  import * as Popover from '$lib/components/ui/popover';

  let {
    value = $bindable(''),
    name,
    label,
    class: className,
  }: {
    /** ISO datetime-local string (YYYY-MM-DDTHH:MM) */
    value: string;
    name: string;
    label: string;
    class?: string;
  } = $props();

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let open = $state(false);

  // Parse value into date part and time part
  const calendarValue = $derived.by(() => {
    if (!value) return undefined;
    const d = new Date(value);
    if (isNaN(d.getTime())) return undefined;
    return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  });

  const hours = $derived.by(() => {
    if (!value) return '12';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '12';
    return String(d.getHours()).padStart(2, '0');
  });

  const minutes = $derived.by(() => {
    if (!value) return '00';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '00';
    return String(d.getMinutes()).padStart(2, '0');
  });

  function rebuildValue(
    date: DateValue | undefined,
    h: string,
    m: string,
  ): string {
    if (!date) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.year}-${pad(date.month)}-${pad(date.day)}T${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  }

  function onCalendarChange(d: DateValue | undefined) {
    value = rebuildValue(d, hours, minutes);
  }

  function onTimeChange(h: string, m: string) {
    value = rebuildValue(calendarValue, h, m);
  }

  const displayDate = $derived.by(() => {
    if (!calendarValue) return null;
    const d = calendarValue.toDate(getLocalTimeZone());
    return dateFmt.format(d);
  });
</script>

<div class={cn('space-y-1', className)}>
  <span class="mb-1 block text-sm font-medium">{label}</span>
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          variant="outline"
          class={cn(
            'w-full justify-start text-left font-normal',
            !value && 'text-muted-foreground',
          )}
          {...props}
        >
          <CalendarIcon class="mr-2 h-4 w-4" />
          {#if displayDate}
            {displayDate} a {hours}h{minutes}
          {:else}
            Selectionner une date
          {/if}
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-auto p-0" align="start">
      <Calendar
        type="single"
        value={calendarValue}
        onValueChange={onCalendarChange}
        initialFocus
      />
      <div
        class="flex items-center justify-center gap-2 border-t border-border px-4 py-3"
      >
        <Clock class="h-4 w-4 text-muted-foreground" />
        <select
          class="rounded-md border border-input bg-card px-2 py-1 text-sm"
          value={hours}
          onchange={(e) => onTimeChange(e.currentTarget.value, minutes)}
        >
          {#each Array.from( { length: 24 }, (_, i) => String(i).padStart(2, '0'), ) as h}
            <option value={h}>{h}</option>
          {/each}
        </select>
        <span class="text-sm font-medium">:</span>
        <select
          class="rounded-md border border-input bg-card px-2 py-1 text-sm"
          value={minutes}
          onchange={(e) => onTimeChange(hours, e.currentTarget.value)}
        >
          {#each ['00', '15', '30', '45'] as m}
            <option value={m}>{m}</option>
          {/each}
        </select>
      </div>
    </Popover.Content>
  </Popover.Root>
  <input type="hidden" {name} {value} />
</div>
