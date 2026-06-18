<script lang="ts">
  import type { PageData } from './$types';
  import { untrack } from 'svelte';
  import CalendarIcon from '@lucide/svelte/icons/calendar';
  import CalendarViewer from '$lib/components/planning/CalendarViewer.svelte';
  import WeekNavigator from '$lib/components/planning/WeekNavigator.svelte';
  import WeekViewToggle from '$lib/components/planning/WeekViewToggle.svelte';
  import ActivitySummaryDialog from '$lib/components/talent/ActivitySummaryDialog.svelte';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import {
    pickInitialWeek,
    pickInitialWeekView,
    type WeekView,
  } from '$lib/domain/calendarWeek';
  import { track } from '$lib/analytics';

  let { data }: { data: PageData } = $props();

  let planning = $derived(data.planning);
  let timeSlots = $derived(planning.slots);
  let range = $derived(planning.range);

  type Slot = (typeof timeSlots)[number];

  // Land on the week of the activity closest to "now" so the talent never opens
  // onto a blank gap week between two far-apart events (or after an all-past
  // timeline). Falls back to the range start when there are no activities.
  let weekStart = $state<Date>(
    untrack(() =>
      pickInitialWeek(
        data.serverNow,
        data.planning.slots,
        data.planning.range ? new Date(data.planning.range.start) : null,
      ),
    ),
  );

  // Open full-week when the timeline has a weekend activity, else work-week, so
  // the default never hides a slot. WeekViewToggle's stored choice overrides it.
  let weekView = $state<WeekView>(
    untrack(() => pickInitialWeekView(data.planning.slots)),
  );

  let previewSlot = $state<Slot | null>(null);
  let previewOpen = $state(false);
  let previewHasStarted = $state(false);
  $effect(() => {
    if (!previewOpen) previewSlot = null;
  });

  // Offset from "this week"; negative = past weeks, 0 = current, positive = future.
  function weekOffset(from: Date): number {
    const ms = from.getTime() - new Date().setHours(0, 0, 0, 0);
    return Math.round(ms / (7 * 86_400_000));
  }

  function openPreview(slot: Slot, hasStarted: boolean) {
    const startTime = new Date(slot.startTime).getTime();
    const daysFromNow = Math.round((startTime - Date.now()) / 86_400_000);
    track('calendar_slot_previewed', {
      slotType: slot.activity?.activityType ?? null,
      daysFromNow,
    });
    previewSlot = slot;
    previewHasStarted = hasStarted;
    previewOpen = true;
  }
</script>

<svelte:head>
  <title>Planning</title>
</svelte:head>

<div class="flex h-dvh flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
  <TalentPageHeader title="Planning">
    {#snippet actions()}
      {#if range}
        <div
          class="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3"
        >
          <WeekViewToggle bind:value={weekView} />
          <WeekNavigator
            {range}
            bind:weekStart
            {weekView}
            onNavigate={(dir) =>
              track('calendar_week_navigated', {
                direction: dir,
                currentWeekOffset: weekOffset(weekStart),
              })}
          />
        </div>
      {/if}
    {/snippet}
  </TalentPageHeader>

  <div class="min-h-0 flex-1 overflow-hidden bg-white dark:bg-slate-900">
    {#if range}
      <CalendarViewer
        class="mx-auto max-w-5xl px-4 md:px-8"
        slots={timeSlots}
        {weekStart}
        {weekView}
        serverNow={data.serverNow}
        dimUnstarted={true}
        onSlotClick={openPreview}
      />
    {:else}
      <div class="flex h-full items-center justify-center px-4">
        <div class="flex max-w-sm flex-col items-center gap-3 text-center">
          <div class="rounded-full bg-slate-100 p-4 dark:bg-slate-800">
            <CalendarIcon class="h-8 w-8 text-slate-400" />
          </div>
          <h2
            class="font-heading text-lg tracking-wide text-slate-700 uppercase dark:text-slate-200"
          >
            Aucune activité au programme<span class="text-epi-teal">_</span>
          </h2>
          <p class="text-sm text-slate-500">
            Ton planning apparaîtra ici dès qu'un événement sera prévu.
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>

<ActivitySummaryDialog
  bind:open={previewOpen}
  slot={previewSlot}
  hasStarted={previewHasStarted}
/>
