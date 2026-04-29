<script lang="ts">
  import { ChevronLeft, ChevronRight, Calendar } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { cn } from '$lib/utils';
  import { formatSlotLabel, type OrgaSlot } from '$lib/domain/presences';

  let {
    eventId,
    currentSlot,
    prevSlot,
    nextSlot,
    timezone,
  }: {
    eventId: string;
    currentSlot: OrgaSlot;
    prevSlot: OrgaSlot | null;
    nextSlot: OrgaSlot | null;
    timezone: string;
  } = $props();

  const buttonBase =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors';
  const buttonEnabled =
    'border-slate-700 bg-slate-900 text-slate-300 hover:border-epi-blue hover:bg-slate-800 hover:text-white';
  const buttonDisabled =
    'cursor-not-allowed border-slate-800 bg-slate-950 text-slate-700';
</script>

<div class="flex items-center gap-2">
  {#if prevSlot}
    <a
      href={resolve(
        `/staff/pedago/events/${eventId}/cockpit/${prevSlot.activityId}`,
      )}
      class={cn(buttonBase, buttonEnabled)}
      aria-label="Créneau précédent"
      title={formatSlotLabel(prevSlot.startTime, prevSlot.endTime, timezone)}
    >
      <ChevronLeft class="h-4 w-4" />
    </a>
  {:else}
    <span class={cn(buttonBase, buttonDisabled)} aria-hidden="true">
      <ChevronLeft class="h-4 w-4" />
    </span>
  {/if}

  <div
    class="flex min-w-0 items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5"
  >
    <Calendar class="h-3.5 w-3.5 shrink-0 text-epi-blue" />
    <span class="truncate text-xs font-bold tracking-wide text-white uppercase">
      {formatSlotLabel(currentSlot.startTime, currentSlot.endTime, timezone)}
    </span>
  </div>

  {#if nextSlot}
    <a
      href={resolve(
        `/staff/pedago/events/${eventId}/cockpit/${nextSlot.activityId}`,
      )}
      class={cn(buttonBase, buttonEnabled)}
      aria-label="Créneau suivant"
      title={formatSlotLabel(nextSlot.startTime, nextSlot.endTime, timezone)}
    >
      <ChevronRight class="h-4 w-4" />
    </a>
  {:else}
    <span class={cn(buttonBase, buttonDisabled)} aria-hidden="true">
      <ChevronRight class="h-4 w-4" />
    </span>
  {/if}
</div>
