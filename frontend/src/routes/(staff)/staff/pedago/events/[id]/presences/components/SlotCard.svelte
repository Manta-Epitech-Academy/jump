<script lang="ts">
  import { resolve } from '$app/paths';
  import { ArrowRight, Clock, Users, CircleAlert } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import {
    formatSlotTimeRange,
    type OrgaSlotWithCounts,
  } from '$lib/domain/presences';
  import SlotStatusBadge from './SlotStatusBadge.svelte';

  let {
    slot,
    eventId,
    timezone,
    isPrimary = false,
  }: {
    slot: OrgaSlotWithCounts;
    eventId: string;
    timezone: string;
    isPrimary?: boolean;
  } = $props();

  const cta = $derived.by(() => {
    if (slot.status === 'live') return "Démarrer l'appel";
    if (slot.status === 'past') return 'Reprendre';
    return "Voir l'appel";
  });

  const presenceRatio = $derived(
    slot.totalCount > 0 ? slot.presentCount / slot.totalCount : 0,
  );

  const href = $derived(
    resolve(`/staff/pedago/events/${eventId}/cockpit/${slot.activityId}`),
  );
</script>

<a
  {href}
  class={cn(
    'group relative block overflow-hidden rounded-lg border bg-card transition-all outline-none',
    'hover:-translate-y-0.5 hover:border-epi-blue hover:shadow-md',
    'focus-visible:ring-2 focus-visible:ring-epi-blue focus-visible:ring-offset-2',
    slot.status === 'live' &&
      'border-epi-blue/60 ring-2 ring-epi-blue/40 dark:bg-epi-blue/5',
    slot.status === 'past' && 'opacity-80',
    isPrimary && slot.status === 'live' && 'shadow-lg',
  )}
>
  {#if slot.totalCount > 0}
    <div class="absolute inset-x-0 bottom-0 h-0.5 bg-muted" aria-hidden="true">
      <div
        class={cn(
          'h-full transition-all',
          slot.status === 'live' ? 'bg-epi-blue' : 'bg-epi-teal-solid',
        )}
        style="width: {Math.round(presenceRatio * 100)}%"
      ></div>
    </div>
  {/if}

  <div class="flex items-center gap-3 px-4 py-3">
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="truncate text-sm font-bold tracking-tight uppercase">
          {slot.nom}
        </span>
        <SlotStatusBadge status={slot.status} />
      </div>
      <div
        class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
      >
        <span class="flex items-center gap-1">
          <Clock class="h-3 w-3" />
          {formatSlotTimeRange(slot.startTime, slot.endTime, timezone)}
        </span>
        <span class="flex items-center gap-1">
          <Users class="h-3 w-3" />
          <span class="font-bold text-foreground">{slot.presentCount}</span>
          <span>/ {slot.totalCount}</span>
        </span>
        {#if slot.lateCount > 0}
          <span
            class="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400"
          >
            <CircleAlert class="h-3 w-3" />
            {slot.lateCount} retard{slot.lateCount > 1 ? 's' : ''}
          </span>
        {/if}
      </div>
    </div>

    <div
      class={cn(
        'flex shrink-0 items-center gap-1 text-xs font-bold tracking-wide uppercase transition-colors',
        slot.status === 'live'
          ? 'text-epi-blue'
          : 'text-muted-foreground group-hover:text-epi-blue',
      )}
    >
      <span class="hidden sm:inline">{cta}</span>
      <ArrowRight
        class="h-4 w-4 transition-transform group-hover:translate-x-0.5"
      />
    </div>
  </div>
</a>
