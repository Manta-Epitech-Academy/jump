<script lang="ts">
  import type { PageData } from './$types';
  import { onMount, untrack } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import ChevronLeft from '@lucide/svelte/icons/chevron-left';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CalendarIcon from '@lucide/svelte/icons/calendar';
  import Zap from '@lucide/svelte/icons/zap';
  import { cn } from '$lib/utils';
  import { activityTypeStyles } from '$lib/validation/templates';
  import ActivitySummaryDialog from '$lib/components/talent/ActivitySummaryDialog.svelte';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import { track } from '$lib/analytics';

  let { data }: { data: PageData } = $props();

  let planning = $derived(data.planning);
  let timeSlots = $derived(planning.slots);
  let range = $derived(planning.range);

  type Slot = (typeof timeSlots)[number];

  const PIXELS_PER_MINUTE = 1.2;
  const WEEK_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function startOfWeek(d: Date): Date {
    const x = startOfDay(d);
    // Monday = 1 ... Sunday = 0; shift so Monday is the first day.
    const dow = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - dow);
    return x;
  }

  function sameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  // Seed time-dependent state from server timestamp so SSR + client hydration
  // render identically. onMount refreshes to real browser time afterwards.
  let nowTime = $state(untrack(() => new Date(data.serverNow)));
  onMount(() => {
    nowTime = new Date();
    const i = setInterval(() => (nowTime = new Date()), 60_000);
    return () => clearInterval(i);
  });

  // Overall span across every event. Falls back to today when the talent has no
  // events, but the grid isn't rendered in that case (empty state below).
  let rangeStart = $derived(
    range ? startOfDay(new Date(range.start)) : startOfDay(nowTime),
  );
  let rangeEnd = $derived(
    range ? startOfDay(new Date(range.end)) : startOfDay(nowTime),
  );

  // Land on the week of the activity closest to "now" so the talent never opens
  // onto a blank gap week between two far-apart events (or after an all-past
  // timeline). Falls back to the range start when there are no activities.
  function pickInitialWeek(
    ts: number,
    slots: Slot[],
    fallbackStart: Date | null,
  ): Date {
    const today = startOfDay(new Date(ts));
    if (slots.length === 0) return startOfWeek(fallbackStart ?? today);
    let nearest = slots[0];
    let nearestDist = Infinity;
    for (const s of slots) {
      const dist = Math.abs(
        startOfDay(new Date(s.startTime)).getTime() - today.getTime(),
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = s;
      }
    }
    return startOfWeek(startOfDay(new Date(nearest.startTime)));
  }

  let weekStart = $state<Date>(
    untrack(() =>
      pickInitialWeek(
        data.serverNow,
        data.planning.slots,
        data.planning.range
          ? startOfDay(new Date(data.planning.range.start))
          : null,
      ),
    ),
  );

  let weekDays = $derived(
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }),
  );

  // A day is in-range if it falls within the overall span of the talent's events.
  function dayInRange(d: Date): boolean {
    return range != null && d >= rangeStart && d <= rangeEnd;
  }

  let canGoPrev = $derived(range != null && weekDays[6] > rangeStart);
  let canGoNext = $derived(range != null && weekDays[0] < rangeEnd);

  let previewSlot = $state<Slot | null>(null);
  let previewOpen = $state(false);
  let previewHasStarted = $derived(
    previewSlot
      ? new Date(previewSlot.startTime).getTime() <= nowTime.getTime()
      : false,
  );
  $effect(() => {
    if (!previewOpen) previewSlot = null;
  });

  // Offset from "this week"; negative = past weeks, 0 = current, positive = future.
  function weekOffset(from: Date): number {
    const ms = from.getTime() - new Date().setHours(0, 0, 0, 0);
    return Math.round(ms / (7 * 86_400_000));
  }

  function openPreview(slot: Slot) {
    const startTime = new Date(slot.startTime).getTime();
    const daysFromNow = Math.round((startTime - Date.now()) / 86_400_000);
    track('calendar_slot_previewed', {
      slotType: slot.activity?.activityType ?? null,
      daysFromNow,
    });
    previewSlot = slot;
    previewOpen = true;
  }

  function prevWeek() {
    if (!canGoPrev) return;
    const n = new Date(weekStart);
    n.setDate(n.getDate() - 7);
    weekStart = n;
    track('calendar_week_navigated', {
      direction: 'prev',
      currentWeekOffset: weekOffset(weekStart),
    });
  }
  function nextWeek() {
    if (!canGoNext) return;
    const n = new Date(weekStart);
    n.setDate(n.getDate() + 7);
    weekStart = n;
    track('calendar_week_navigated', {
      direction: 'next',
      currentWeekOffset: weekOffset(weekStart),
    });
  }

  // Build a map day→slots only for slots falling in the visible week.
  type PackedSlot = Slot & {
    colIndex: number;
    colSpan: number;
    numCols: number;
  };

  function packOverlaps(daySlots: Slot[]): PackedSlot[] {
    function overlaps(a: Slot, b: Slot) {
      const sa = new Date(a.startTime).getTime();
      const ea = new Date(a.endTime).getTime();
      const sb = new Date(b.startTime).getTime();
      const eb = new Date(b.endTime).getTime();
      return sa < eb && sb < ea;
    }

    const sorted = [...daySlots].sort((a, b) => {
      const sa = new Date(a.startTime).getTime();
      const sb = new Date(b.startTime).getTime();
      if (sa !== sb) return sa - sb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    // Connected-overlap groups: isolated slot on same day as overlapping
    // cluster still fills full width.
    const visited = new Set<string>();
    const groups: Slot[][] = [];
    for (const slot of sorted) {
      if (visited.has(slot.id)) continue;
      const group: Slot[] = [slot];
      visited.add(slot.id);
      const queue: Slot[] = [slot];
      while (queue.length) {
        const curr = queue.shift()!;
        for (const other of sorted) {
          if (visited.has(other.id)) continue;
          if (overlaps(curr, other)) {
            visited.add(other.id);
            group.push(other);
            queue.push(other);
          }
        }
      }
      groups.push(group);
    }

    const out: PackedSlot[] = [];
    for (const group of groups) {
      const groupSorted = [...group].sort((a, b) => {
        const sa = new Date(a.startTime).getTime();
        const sb = new Date(b.startTime).getTime();
        if (sa !== sb) return sa - sb;
        const ea = new Date(a.endTime).getTime();
        const eb = new Date(b.endTime).getTime();
        if (ea !== eb) return ea - eb;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      const columns: Slot[][] = [];
      for (const slot of groupSorted) {
        let placed = false;
        for (const col of columns) {
          if (!col.some((existing) => overlaps(slot, existing))) {
            col.push(slot);
            placed = true;
            break;
          }
        }
        if (!placed) columns.push([slot]);
      }
      const numCols = columns.length || 1;
      for (let c = 0; c < columns.length; c++) {
        for (const slot of columns[c]) {
          // Expand to the right: widen into adjacent columns that have no
          // slot overlapping this one's lifespan, so tail-end gaps close up.
          let colSpan = 1;
          for (let next = c + 1; next < columns.length; next++) {
            if (columns[next].some((other) => overlaps(slot, other))) break;
            colSpan++;
          }
          out.push({ ...slot, colIndex: c, colSpan, numCols });
        }
      }
    }
    return out;
  }

  function dayKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  let slotsByDay = $derived.by(() => {
    const map = new Map<number, PackedSlot[]>();
    const dayIndexByKey = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      dayIndexByKey.set(dayKey(weekDays[i]), i);
    }
    const byDay = new Map<number, Slot[]>();
    for (const s of timeSlots) {
      const slotDay = startOfDay(new Date(s.startTime));
      const dayIdx = dayIndexByKey.get(dayKey(slotDay));
      if (dayIdx === undefined) continue;
      const arr = byDay.get(dayIdx) ?? [];
      arr.push(s);
      byDay.set(dayIdx, arr);
    }
    for (const [dayIdx, slots] of byDay) {
      map.set(dayIdx, packOverlaps(slots));
    }
    return map;
  });

  // Which event(s) the visible week belongs to, shown as the header subtitle.
  // Events don't overlap in practice, so this is usually a single title; the
  // join only matters on the rare seam where one event ends and another begins.
  let visibleEventTitle = $derived.by(() => {
    const titres: string[] = [];
    for (const s of [...slotsByDay.values()].flat()) {
      if (!titres.includes(s.event.titre)) titres.push(s.event.titre);
    }
    return titres.length ? titres.join(' · ') : undefined;
  });

  // Hour range: tight to the week's slots, with a small pad. Falls back to
  // 8–20 when the week has no slots.
  let hourRange = $derived.by(() => {
    const visible = [...slotsByDay.values()].flat();
    if (visible.length === 0) return { start: 8, end: 20 };
    let minH = 23;
    let maxH = 0;
    for (const s of visible) {
      const a = new Date(s.startTime);
      const b = new Date(s.endTime);
      if (a.getHours() < minH) minH = a.getHours();
      const endH = b.getHours() + (b.getMinutes() > 0 ? 1 : 0);
      if (endH > maxH) maxH = endH;
    }
    return {
      start: Math.max(0, minH - 1),
      end: Math.min(24, Math.max(minH + 1, maxH) + 1),
    };
  });

  let hours = $derived(
    Array.from(
      { length: hourRange.end - hourRange.start },
      (_, i) => hourRange.start + i,
    ),
  );
  let gridHeightPx = $derived(
    (hourRange.end - hourRange.start) * 60 * PIXELS_PER_MINUTE,
  );

  function minutesIntoDay(d: Date | string): number {
    const x = new Date(d);
    return x.getHours() * 60 + x.getMinutes();
  }

  function pixelsFromTime(d: Date | string): number {
    return (minutesIntoDay(d) - hourRange.start * 60) * PIXELS_PER_MINUTE;
  }

  function formatTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function weekLabel(): string {
    const a = weekDays[0];
    const b = weekDays[6];
    const sameMonth = a.getMonth() === b.getMonth();
    const sameYear = a.getFullYear() === b.getFullYear();
    const left = a.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: sameMonth && sameYear ? undefined : 'short',
      year: sameYear ? undefined : 'numeric',
    });
    const right = b.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return `${left} – ${right}`;
  }

  let todayIdx = $derived(weekDays.findIndex((d) => sameDay(d, nowTime)));
  let nowLineTop = $derived(pixelsFromTime(nowTime));
  let nowLineVisible = $derived(
    todayIdx >= 0 && nowLineTop >= 0 && nowLineTop <= gridHeightPx,
  );
</script>

<svelte:head>
  <title>Planning</title>
</svelte:head>

<div class="flex h-dvh flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
  <TalentPageHeader title="Planning" subtitle={visibleEventTitle}>
    {#snippet actions()}
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
          {weekLabel()}
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
    {/snippet}
  </TalentPageHeader>

  <div class="min-h-0 flex-1 overflow-hidden bg-white dark:bg-slate-900">
    {#if range}
      <div class="mx-auto flex h-full w-full max-w-5xl flex-col px-4 md:px-8">
        <!-- Day header row -->
        <div
          class="grid shrink-0 border-b border-slate-200 dark:border-slate-800"
          style="grid-template-columns: 3rem repeat(7, minmax(0, 1fr));"
        >
          <div></div>
          {#each weekDays as d, i (i)}
            {@const inRange = dayInRange(d)}
            {@const isToday = sameDay(d, nowTime)}
            <div
              class={cn(
                'flex flex-col items-center justify-center gap-0.5 py-2 text-center',
                !inRange && 'opacity-30',
              )}
            >
              <span
                class={cn(
                  'text-[10px] font-bold tracking-wider uppercase',
                  isToday ? 'text-epi-blue' : 'text-slate-400',
                )}
              >
                {WEEK_DAYS[i]}
              </span>
              <span
                class={cn(
                  'text-sm font-semibold',
                  isToday
                    ? 'flex h-6 w-6 items-center justify-center rounded-full bg-epi-blue text-white'
                    : 'text-slate-700 dark:text-slate-300',
                )}
              >
                {d.getDate()}
              </span>
            </div>
          {/each}
        </div>

        <!-- Time grid -->
        <div class="min-h-0 flex-1 overflow-y-auto">
          <div
            class="relative grid"
            style="grid-template-columns: 3rem repeat(7, minmax(0, 1fr)); height: {gridHeightPx}px;"
          >
            <!-- Hour labels column -->
            <div class="relative">
              {#each hours as h, i (h)}
                <div
                  class="absolute right-1 -translate-y-1/2 text-[10px] font-medium text-slate-400 tabular-nums"
                  style="top: {i * 60 * PIXELS_PER_MINUTE}px;"
                  class:opacity-0={i === 0}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              {/each}
            </div>

            <!-- Day columns -->
            {#each weekDays as d, i (i)}
              {@const inRange = dayInRange(d)}
              {@const daySlots = slotsByDay.get(i) ?? []}
              <div
                class={cn(
                  'relative border-l border-slate-100 dark:border-slate-800',
                  !inRange &&
                    'bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(100,116,139,0.04)_6px_12px)]',
                )}
              >
                <!-- Hour grid lines -->
                {#each hours as _, idx (idx)}
                  {#if idx > 0}
                    <div
                      class="absolute inset-x-0 border-t border-slate-100 dark:border-slate-800"
                      style="top: {idx * 60 * PIXELS_PER_MINUTE}px;"
                    ></div>
                  {/if}
                {/each}

                <!-- Activity blocks -->
                {#each daySlots as slot (slot.id)}
                  {#if slot.activity}
                    {@const activity = slot.activity}
                    {@const styles =
                      activityTypeStyles[
                        activity.activityType as keyof typeof activityTypeStyles
                      ]}
                    {@const top = pixelsFromTime(slot.startTime)}
                    {@const height = Math.max(
                      20 * PIXELS_PER_MINUTE,
                      pixelsFromTime(slot.endTime) - top,
                    )}
                    {@const hasStarted =
                      new Date(slot.startTime).getTime() <= nowTime.getTime()}
                    {@const widthPct = (98 * slot.colSpan) / slot.numCols}
                    {@const leftPct = (slot.colIndex * 98) / slot.numCols + 1}
                    <button
                      type="button"
                      class={cn(
                        'absolute flex cursor-pointer flex-col gap-0.5 overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left transition-all hover:z-10 hover:shadow-md',
                        styles?.bg,
                        styles?.border,
                        'border-y border-r border-y-border border-r-border',
                        !hasStarted && 'opacity-60 hover:opacity-100',
                      )}
                      style="top: {top}px; height: {height}px; left: {leftPct}%; width: calc({widthPct}% - 2px);"
                      aria-label={activity.nom}
                      onclick={() => openPreview(slot)}
                    >
                      <span
                        class={cn(
                          'text-[10px] leading-tight font-bold break-words',
                          styles?.text,
                        )}
                      >
                        {activity.nom}
                      </span>
                      <div
                        class="flex items-center gap-1 text-[9px] font-medium text-muted-foreground"
                      >
                        {#if activity.isDynamic}
                          <Zap class="h-2.5 w-2.5 text-epi-orange" />
                        {/if}
                        <span>
                          {formatTime(slot.startTime)} – {formatTime(
                            slot.endTime,
                          )}
                        </span>
                      </div>
                    </button>
                  {/if}
                {/each}

                <!-- Now line (today only) -->
                {#if todayIdx === i && nowLineVisible}
                  <div
                    class="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                    style="top: {nowLineTop}px;"
                  >
                    <span
                      class="h-2 w-2 -translate-x-1 rounded-full bg-epi-blue"
                    ></span>
                    <span class="h-px flex-1 bg-epi-blue"></span>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
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
