<script lang="ts">
  import { TimeField } from 'bits-ui';
  import { Time } from '@internationalized/date';
  import { Clock } from '@lucide/svelte';
  import TimeSegment from './time-segment.svelte';
  import { cn } from '$lib/utils';

  let {
    value = $bindable(''),
    name,
    id,
    required = false,
    disabled = false,
    icon = true,
    class: className,
  }: {
    value?: string;
    name?: string;
    id?: string;
    required?: boolean;
    disabled?: boolean;
    icon?: boolean;
    class?: string;
  } = $props();

  function parseTime(s: string): Time | undefined {
    if (!s) return undefined;
    const [h, m] = s.split(':').map(Number);
    if (
      !Number.isFinite(h) ||
      !Number.isFinite(m) ||
      h < 0 ||
      h > 23 ||
      m < 0 ||
      m > 59
    ) {
      return undefined;
    }
    return new Time(h, m);
  }

  function formatTime(t: Time | undefined | null): string {
    if (!t) return '';
    return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
  }

  let timeValue = $state<Time | undefined>(parseTime(value));

  $effect(() => {
    const parsed = parseTime(value);
    if (formatTime(parsed) !== formatTime(timeValue)) {
      timeValue = parsed;
    }
  });
</script>

<TimeField.Root
  value={timeValue}
  onValueChange={(v) => {
    timeValue = (v as Time | undefined) ?? undefined;
    const next = formatTime(timeValue);
    if (next !== value) value = next;
  }}
  hourCycle={24}
  granularity="minute"
  locale="fr-FR"
  {disabled}
  {required}
>
  <div class="relative">
    {#if icon}
      <div
        class="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center justify-center pl-3 text-muted-foreground/80"
      >
        <Clock class="h-4 w-4" aria-hidden="true" />
      </div>
    {/if}
    <TimeField.Input
      {id}
      class={cn(
        'relative inline-flex h-9 w-full items-center overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 focus-within:has-aria-invalid:border-destructive focus-within:has-aria-invalid:ring-destructive/20 dark:focus-within:has-aria-invalid:ring-destructive/40',
        icon && 'pl-9',
        className,
      )}
    >
      {#snippet children({ segments })}
        {#each segments as segment, i (segment.part + i)}
          {#if segment.part !== 'dayPeriod'}
            <TimeSegment {segment} />
          {/if}
        {/each}
      {/snippet}
    </TimeField.Input>
  </div>
  {#if name}
    <input type="hidden" {name} value={formatTime(timeValue)} {required} />
  {/if}
</TimeField.Root>
