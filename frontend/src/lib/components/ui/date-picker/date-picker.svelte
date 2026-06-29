<script lang="ts">
  import CalendarIcon from '@lucide/svelte/icons/calendar';
  import X from '@lucide/svelte/icons/x';
  import {
    DateFormatter,
    getLocalTimeZone,
    parseDate,
    type DateValue,
  } from '@internationalized/date';
  import { cn } from '$lib/utils';
  import { Button } from '$lib/components/ui/button';
  import { Calendar } from '$lib/components/ui/calendar';
  import * as Popover from '$lib/components/ui/popover';

  // String-native, fr-locale date picker. Mirrors the TimePicker contract
  // (string in/out + a hidden input named `name`) so superform's DOM FormData
  // posts a clean `YYYY-MM-DD` (or "" when cleared). Replaces native
  // `<input type="date">`, whose displayed order (mm/dd/yyyy) follows the
  // browser locale, not French.
  let {
    value = $bindable(''),
    name,
    id,
    min,
    placeholder = 'Sélectionner une date',
    class: className,
  }: {
    /** Calendar day as `YYYY-MM-DD`, or "" when unset. */
    value?: string;
    name?: string;
    id?: string;
    /** Earliest selectable day, `YYYY-MM-DD`. */
    min?: string;
    placeholder?: string;
    class?: string;
  } = $props();

  const df = new DateFormatter('fr-FR', { dateStyle: 'long' });

  function parse(s: string | undefined): DateValue | undefined {
    if (!s) return undefined;
    try {
      return parseDate(s);
    } catch {
      return undefined;
    }
  }

  let open = $state(false);
  let dateValue = $state<DateValue | undefined>(parse(value));

  // Keep the internal DateValue in sync when the bound string changes from the
  // outside (e.g. the dialog reopening on a different event).
  $effect(() => {
    const parsed = parse(value);
    if ((parsed?.toString() ?? '') !== (dateValue?.toString() ?? '')) {
      dateValue = parsed;
    }
  });

  const minValue = $derived(parse(min));
</script>

<div class={cn('relative', className)}>
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          {id}
          variant="outline"
          class={cn(
            // Strip the Button's button-typography (uppercase/bold/tracking,
            // rounded-sm, px-4) so this trigger reads as a form field, matching
            // the TimePicker / Input next to it (rounded-md, normal text, px-3).
            'h-9 w-full justify-start rounded-md px-3 text-left font-normal tracking-normal normal-case',
            // Reserve room for the overlaid clear button so the label never runs
            // under it. The button is absolutely positioned (below), so it adds
            // no width and can't break a grid/flex track the picker sits in.
            value && 'pr-9',
            !dateValue && 'text-muted-foreground',
          )}
        >
          <CalendarIcon class="mr-2 size-4 shrink-0" />
          {dateValue
            ? df.format(dateValue.toDate(getLocalTimeZone()))
            : placeholder}
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-auto p-0" align="start">
      <Calendar
        type="single"
        value={dateValue}
        {minValue}
        locale="fr-FR"
        onValueChange={(v) => {
          const next = v ? v.toString() : '';
          if (next !== value) value = next;
          open = false;
        }}
      />
    </Popover.Content>
  </Popover.Root>
  {#if value}
    <button
      type="button"
      aria-label="Effacer la date"
      onclick={() => (value = '')}
      class="absolute top-1/2 right-1 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <X class="size-4" />
    </button>
  {/if}
  {#if name}
    <input type="hidden" {name} {value} />
  {/if}
</div>
