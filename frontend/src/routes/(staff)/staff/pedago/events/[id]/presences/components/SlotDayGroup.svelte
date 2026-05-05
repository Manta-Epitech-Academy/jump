<script lang="ts">
  import { cn } from '$lib/utils';
  import type { OrgaSlotWithCounts } from '$lib/domain/presences';
  import SlotCard from './SlotCard.svelte';

  let {
    dayLabel,
    slots,
    eventId,
    timezone,
    primarySlotId,
  }: {
    dayLabel: string;
    slots: OrgaSlotWithCounts[];
    eventId: string;
    timezone: string;
    primarySlotId: string | null;
  } = $props();

  const dayTense = $derived.by(() => {
    if (slots.some((s) => s.status === 'live')) return 'today' as const;
    if (slots.every((s) => s.status === 'past')) return 'past' as const;
    return 'future' as const;
  });
</script>

<section class="space-y-3">
  <header class="flex items-center gap-3">
    <h2
      class={cn(
        'text-xs font-black tracking-widest uppercase',
        dayTense === 'today' && 'text-epi-blue',
        dayTense === 'past' && 'text-muted-foreground',
        dayTense === 'future' && 'text-foreground',
      )}
    >
      {dayLabel}
    </h2>
    <div class="h-px flex-1 bg-border"></div>
    <span class="text-[10px] font-medium text-muted-foreground uppercase">
      {slots.length} créneau{slots.length > 1 ? 'x' : ''}
    </span>
  </header>

  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
    {#each slots as slot (slot.activityId)}
      <SlotCard
        {slot}
        {eventId}
        {timezone}
        isPrimary={slot.activityId === primarySlotId}
      />
    {/each}
  </div>
</section>
