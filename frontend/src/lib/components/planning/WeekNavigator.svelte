<script lang="ts">
  import { Button } from '#lib/components/ui/button/index.ts';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import {
    addWeeks,
    weekDaysFrom,
    weekLabel,
    WEEK_VIEW_DAYS,
    type WeekView,
  } from '#lib/domain/calendarWeek.ts';
  import type { DateKey } from '#lib/domain/planningTime.ts';

  let {
    range,
    weekStart = $bindable(),
    weekView = 'work',
    onNavigate,
  }: {
    /**
     * Overall span the week may page across, first and last campus day; null
     * hides the controls.
     */
    range: { start: DateKey; end: DateKey } | null;
    /** Monday of the visible week, a campus day, two-way bound with the parent. */
    weekStart: DateKey;
    /** Work week or full week; only changes the label span, not the paging. */
    weekView?: WeekView;
    /** Fired after a successful page, for analytics. */
    onNavigate?: (dir: 'prev' | 'next') => void;
  } = $props();

  // Paging always steps a full Monday-to-Monday week regardless of the view, so
  // the bounds check the full 7-day span; only the label follows the view.
  let weekDays = $derived(weekDaysFrom(weekStart));
  let labelDays = $derived(weekDaysFrom(weekStart, WEEK_VIEW_DAYS[weekView]));
  // Keys are ISO days, so comparing them as strings compares the days.
  let canGoPrev = $derived(range != null && weekDays[6] > range.start);
  let canGoNext = $derived(range != null && weekDays[0] < range.end);

  function prevWeek() {
    if (!canGoPrev) return;
    weekStart = addWeeks(weekStart, -1);
    onNavigate?.('prev');
  }
  function nextWeek() {
    if (!canGoNext) return;
    weekStart = addWeeks(weekStart, 1);
    onNavigate?.('next');
  }
</script>

{#if range}
  <div class="flex items-center gap-2">
    <Button
      variant="outline"
      size="icon"
      class="h-8 w-8"
      disabled={!canGoPrev}
      onclick={prevWeek}
      aria-label="Semaine précédente"
    >
      <ChevronLeft class="h-4 w-4" />
    </Button>
    <span
      class="min-w-40 text-center text-xs font-bold text-foreground-secondary uppercase"
    >
      {weekLabel(labelDays)}
    </span>
    <Button
      variant="outline"
      size="icon"
      class="h-8 w-8"
      disabled={!canGoNext}
      onclick={nextWeek}
      aria-label="Semaine suivante"
    >
      <ChevronRight class="h-4 w-4" />
    </Button>
  </div>
{/if}
