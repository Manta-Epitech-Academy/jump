<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import {
    startOfDay,
    weekDaysFrom,
    weekLabel,
    WEEK_VIEW_DAYS,
    type WeekView,
  } from '$lib/domain/calendarWeek';

  let {
    range,
    weekStart = $bindable(),
    weekView = 'work',
    onNavigate,
  }: {
    /** Overall span the week may page across; null hides the controls. */
    range: { start: Date; end: Date } | null;
    /** Monday of the visible week, two-way bound with the parent. */
    weekStart: Date;
    /** Work week or full week; only changes the label span, not the paging. */
    weekView?: WeekView;
    /** Fired after a successful page, for analytics. */
    onNavigate?: (dir: 'prev' | 'next') => void;
  } = $props();

  // Paging always steps a full Monday-to-Monday week regardless of the view, so
  // the bounds check the full 7-day span; only the label follows the view.
  let weekDays = $derived(weekDaysFrom(weekStart));
  let labelDays = $derived(weekDaysFrom(weekStart, WEEK_VIEW_DAYS[weekView]));
  let rangeStart = $derived(range ? startOfDay(range.start) : null);
  let rangeEnd = $derived(range ? startOfDay(range.end) : null);
  let canGoPrev = $derived(rangeStart != null && weekDays[6] > rangeStart);
  let canGoNext = $derived(rangeEnd != null && weekDays[0] < rangeEnd);

  function prevWeek() {
    if (!canGoPrev) return;
    const n = new Date(weekStart);
    n.setDate(n.getDate() - 7);
    weekStart = n;
    onNavigate?.('prev');
  }
  function nextWeek() {
    if (!canGoNext) return;
    const n = new Date(weekStart);
    n.setDate(n.getDate() + 7);
    weekStart = n;
    onNavigate?.('next');
  }
</script>

{#if range}
  <Button
    variant="outline"
    size="icon"
    class="h-8 w-8"
    disabled={!canGoPrev}
    onclick={prevWeek}
  >
    <ChevronLeft class="h-4 w-4" />
  </Button>
  <span
    class="min-w-40 text-center text-xs font-bold text-slate-600 uppercase dark:text-slate-300"
  >
    {weekLabel(labelDays)}
  </span>
  <Button
    variant="outline"
    size="icon"
    class="h-8 w-8"
    disabled={!canGoNext}
    onclick={nextWeek}
  >
    <ChevronRight class="h-4 w-4" />
  </Button>
{/if}
