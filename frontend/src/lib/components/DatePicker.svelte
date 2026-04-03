<script lang="ts">
  import { Calendar as CalendarIcon } from '@lucide/svelte';
  import {
    DateFormatter,
    type DateValue,
    getLocalTimeZone,
  } from '@internationalized/date';
  import { cn } from '$lib/utils';
  import { Button } from '$lib/components/ui/button';
  import { Calendar } from '$lib/components/ui/calendar';
  import * as Popover from '$lib/components/ui/popover';

  let {
    value = $bindable(),
    name = 'date',
    placeholder = 'Sélectionner une date',
    class: className,
  }: {
    value: DateValue | undefined;
    name?: string;
    placeholder?: string;
    class?: string;
  } = $props();

  const df = new DateFormatter('fr-FR', {
    dateStyle: 'long',
  });

  let open = $state(false);
</script>

<div class={cn('grid gap-2', className)}>
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
          {value ? df.format(value.toDate(getLocalTimeZone())) : placeholder}
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-auto p-0" align="start">
      <Calendar
        type="single"
        bind:value
        initialFocus
        onValueChange={() => {
          open = false;
        }}
      />
    </Popover.Content>
  </Popover.Root>
  <input type="hidden" {name} value={value ? value.toString() : ''} />
</div>
