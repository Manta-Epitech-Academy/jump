<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import Check from '@lucide/svelte/icons/check';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';
  import { cn } from '$lib/utils';
  import {
    dayLabelFr,
    slotLabelFr,
    PRESENCE_SLOTS,
    type EventSlot,
    type PresenceSlot,
  } from '$lib/domain/eventPresence';

  // Picks one émargement créneau in two orthogonal moves rather than stepping a
  // flat list of ~20: jump to a DAY (prev/next or dropdown), then flip the
  // Matin|Après-midi half-day with a single click. The flat slots list (each
  // working day × 2) stays the source of truth; this just projects the day axis
  // and the half-day axis out of it.
  let {
    slots,
    value = $bindable(),
    onChange,
  }: {
    slots: EventSlot[];
    value: string;
    onChange?: (key: string) => void;
  } = $props();

  // Unique day keys, in slot order (slots are already chronological).
  const days = $derived([...new Set(slots.map((s) => s.day))]);

  const active = $derived(slots.find((s) => s.key === value) ?? null);
  const dayIndex = $derived(active ? days.indexOf(active.day) : -1);
  const canPrevDay = $derived(dayIndex > 0);
  const canNextDay = $derived(dayIndex >= 0 && dayIndex < days.length - 1);

  // Half-days that actually exist for the active day. Both, per the data model,
  // but derived from the list so an irregular event can never offer a créneau
  // that isn't there.
  const halfOptions = $derived(
    PRESENCE_SLOTS.filter((sl) =>
      slots.some((s) => s.day === active?.day && s.slot === sl),
    ).map((sl) => ({ value: sl, label: slotLabelFr(sl) })),
  );

  function set(key: string) {
    if (key === value) return;
    value = key;
    onChange?.(key);
  }

  // Jump to a day, keeping the current half-day when that day has it.
  function selectDay(day: string) {
    const half: PresenceSlot = active?.slot ?? 'morning';
    const target =
      slots.find((s) => s.day === day && s.slot === half) ??
      slots.find((s) => s.day === day);
    if (target) set(target.key);
  }
  function stepDay(delta: number) {
    const day = days[dayIndex + delta];
    if (day) selectDay(day);
  }
  function selectHalf(half: string) {
    const target = slots.find((s) => s.day === active?.day && s.slot === half);
    if (target) set(target.key);
  }
</script>

{#if slots.length > 0}
  <div class="flex flex-wrap items-center gap-2">
    <div class="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon"
        class="h-8 w-8 rounded-sm"
        disabled={!canPrevDay}
        onclick={() => stepDay(-1)}
        aria-label="Jour précédent"
      >
        <ChevronLeft class="h-4 w-4" />
      </Button>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          disabled={days.length <= 1}
          class="inline-flex h-8 min-w-44 cursor-pointer items-center justify-center gap-2 rounded-sm border bg-background px-3 text-xs font-bold uppercase disabled:cursor-default"
        >
          <CalendarClock class="h-4 w-4 text-muted-foreground" />
          {active ? dayLabelFr(active.day) : '-'}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content class="max-h-80 overflow-y-auto">
          {#each days as day (day)}
            <DropdownMenu.Item
              class="cursor-pointer"
              onSelect={() => selectDay(day)}
            >
              <Check
                class={cn(
                  'mr-2 h-4 w-4',
                  day === active?.day ? 'opacity-100' : 'opacity-0',
                )}
              />
              {dayLabelFr(day)}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <Button
        variant="outline"
        size="icon"
        class="h-8 w-8 rounded-sm"
        disabled={!canNextDay}
        onclick={() => stepDay(1)}
        aria-label="Jour suivant"
      >
        <ChevronRight class="h-4 w-4" />
      </Button>
    </div>

    {#if active}
      <SegmentedFilter
        options={halfOptions}
        value={active.slot}
        onChange={selectHalf}
        ariaLabel="Demi-journée"
      />
    {/if}
  </div>
{/if}
