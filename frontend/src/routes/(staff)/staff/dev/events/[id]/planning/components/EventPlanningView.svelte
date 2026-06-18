<script lang="ts">
  import { untrack } from 'svelte';
  import { resolve } from '$app/paths';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import CalendarViewer from '$lib/components/planning/CalendarViewer.svelte';
  import WeekNavigator from '$lib/components/planning/WeekNavigator.svelte';
  import WeekViewToggle from '$lib/components/planning/WeekViewToggle.svelte';
  import ActivityPreviewDialog from '$lib/components/events/planning/ActivityPreviewDialog.svelte';
  import { STAGE_SECONDE_LABEL } from '$lib/domain/event';
  import {
    pickInitialWeek,
    pickInitialWeekView,
    startOfDay,
    type WeekView,
  } from '$lib/domain/calendarWeek';
  import type { TimeSlotWithActivity } from '$lib/types';
  import type { PageData } from '../$types';

  // One event's read-only planning. The page remounts this via {#key event.id},
  // so every per-event piece of state below (the visible week, the open preview)
  // re-seeds from scratch when staff switch events. The dev space can reach
  // several events' planning (sidebar active stage, plus any event via history),
  // and without the remount the week stayed pinned to whichever event loaded
  // first, opening the next one on a blank week.
  let {
    event,
    planning,
    timezone,
    serverNow,
    hasCodingClub,
  }: {
    event: PageData['event'];
    planning: PageData['planning'];
    timezone: PageData['timezone'];
    serverNow: PageData['serverNow'];
    hasCodingClub: boolean;
  } = $props();

  let slots = $derived(planning.timeSlots as TimeSlotWithActivity[]);
  let range = $derived({
    start: startOfDay(new Date(event.date)),
    end: startOfDay(new Date(event.endDate ?? event.date)),
  });

  let weekStart = $state<Date>(
    untrack(() =>
      pickInitialWeek(
        serverNow,
        planning.timeSlots,
        startOfDay(new Date(event.date)),
      ),
    ),
  );

  // Open full-week when the event has a weekend slot, else work-week, so the
  // default never hides a slot. WeekViewToggle's stored choice overrides it.
  let weekView = $state<WeekView>(
    untrack(() => pickInitialWeekView(planning.timeSlots)),
  );

  let previewSlot = $state<TimeSlotWithActivity | null>(null);
  let previewOpen = $state(false);
  $effect(() => {
    if (!previewOpen) previewSlot = null;
  });
</script>

<div class="flex h-[calc(100vh-4rem)] flex-col bg-background">
  <div class="shrink-0 border-b pb-4">
    {#if hasCodingClub}
      <PageBreadcrumb
        items={[
          {
            label: STAGE_SECONDE_LABEL,
            href: resolve(`/staff/dev/events/${event.id}`),
          },
          { label: 'Planning' },
        ]}
      />
    {/if}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-epi-blue uppercase">
          Planning<span class="text-epi-teal">_</span>
        </h1>
        <p
          class="text-sm font-bold tracking-wider text-muted-foreground uppercase"
        >
          {STAGE_SECONDE_LABEL} • {new Date(event.date).toLocaleDateString(
            'fr-FR',
            {
              day: 'numeric',
              month: 'short',
              timeZone: timezone,
            },
          )}{#if event.endDate}
            – {new Date(event.endDate).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
              timeZone: timezone,
            })}
          {/if}
        </p>
      </div>
      <div
        class="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3"
      >
        <WeekViewToggle bind:value={weekView} />
        <WeekNavigator {range} bind:weekStart {weekView} />
      </div>
    </div>
  </div>

  <div class="flex-1 overflow-hidden p-4">
    <CalendarViewer
      {slots}
      {weekStart}
      {weekView}
      {serverNow}
      dimUnstarted={false}
      onSlotClick={(slot) => {
        previewSlot = slot;
        previewOpen = true;
      }}
    />
  </div>
</div>

<ActivityPreviewDialog bind:open={previewOpen} slot={previewSlot} {timezone} />
