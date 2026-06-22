<script lang="ts" module>
  /**
   * The minimum a slot must carry to be laid on the grid. Both the talent
   * calendar's `CalendarSlot` and the dev space's `TimeSlotWithActivity` are
   * structural supersets of this, so each space feeds its own rows unchanged and
   * gets them back, fully typed, from `onSlotClick`.
   */
  export type ViewerSlot = {
    id: string;
    startTime: Date | string;
    endTime: Date | string;
    activity: {
      nom: string;
      activityType: string;
      isDynamic: boolean;
    } | null;
  };
</script>

<script lang="ts" generics="S extends ViewerSlot">
  import { onMount, untrack } from 'svelte';
  import Zap from '@lucide/svelte/icons/zap';
  import { cn } from '$lib/utils';
  import { activityTypeStyles } from '$lib/validation/templates';
  import {
    sameDay,
    weekDaysFrom,
    WEEK_VIEW_DAYS,
    type WeekView,
  } from '$lib/domain/calendarWeek';

  let {
    slots,
    weekStart,
    weekView = 'work',
    serverNow,
    dimUnstarted = false,
    onSlotClick,
    class: className,
  }: {
    slots: S[];
    /** Monday of the visible week, owned by the parent. */
    weekStart: Date;
    /** Work week (Mon-Fri) or full week (Mon-Sun). Drives the column count. */
    weekView?: WeekView;
    /** Server timestamp seed so SSR and first client render agree. */
    serverNow: number;
    /** Dim slots that haven't started yet (talent), or show them at full
     * opacity (dev). Never gates clickability either way. */
    dimUnstarted?: boolean;
    onSlotClick: (slot: S, hasStarted: boolean) => void;
    class?: string;
  } = $props();

  const PIXELS_PER_MINUTE = 1.2;
  const WEEK_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  // Seed time-dependent state from the server timestamp so SSR + client hydration
  // render identically. onMount refreshes to real browser time afterwards.
  let nowTime = $state(untrack(() => new Date(serverNow)));
  onMount(() => {
    nowTime = new Date();
    const i = setInterval(() => (nowTime = new Date()), 60_000);
    return () => clearInterval(i);
  });

  let dayCount = $derived(WEEK_VIEW_DAYS[weekView]);
  let weekDays = $derived(weekDaysFrom(weekStart, dayCount));

  type PackedSlot = S & {
    colIndex: number;
    colSpan: number;
    numCols: number;
  };

  function packOverlaps(daySlots: S[]): PackedSlot[] {
    function overlaps(a: S, b: S) {
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
    const groups: S[][] = [];
    for (const slot of sorted) {
      if (visited.has(slot.id)) continue;
      const group: S[] = [slot];
      visited.add(slot.id);
      const queue: S[] = [slot];
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
      const columns: S[][] = [];
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
    for (let i = 0; i < weekDays.length; i++) {
      dayIndexByKey.set(dayKey(weekDays[i]), i);
    }
    const byDay = new Map<number, S[]>();
    for (const s of slots) {
      const slotDay = new Date(s.startTime);
      slotDay.setHours(0, 0, 0, 0);
      const dayIdx = dayIndexByKey.get(dayKey(slotDay));
      if (dayIdx === undefined) continue;
      const arr = byDay.get(dayIdx) ?? [];
      arr.push(s);
      byDay.set(dayIdx, arr);
    }
    for (const [dayIdx, daySlots] of byDay) {
      map.set(dayIdx, packOverlaps(daySlots));
    }
    return map;
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

  let todayIdx = $derived(weekDays.findIndex((d) => sameDay(d, nowTime)));
  let nowLineTop = $derived(pixelsFromTime(nowTime));
  let nowLineVisible = $derived(
    todayIdx >= 0 && nowLineTop >= 0 && nowLineTop <= gridHeightPx,
  );
</script>

<div class={cn('flex h-full w-full flex-col', className)}>
  <!-- Day header row -->
  <div
    class="grid shrink-0 border-b border-slate-200 dark:border-slate-800"
    style="grid-template-columns: 3rem repeat({dayCount}, minmax(0, 1fr));"
  >
    <div></div>
    {#each weekDays as d, i (i)}
      {@const isToday = sameDay(d, nowTime)}
      <div
        class="flex flex-col items-center justify-center gap-0.5 py-2 text-center"
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
      style="grid-template-columns: 3rem repeat({dayCount}, minmax(0, 1fr)); height: {gridHeightPx}px;"
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
      {#each weekDays as _, i (i)}
        {@const daySlots = slotsByDay.get(i) ?? []}
        <div class="relative border-l border-slate-100 dark:border-slate-800">
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
                  dimUnstarted && !hasStarted && 'opacity-60 hover:opacity-100',
                )}
                style="top: {top}px; height: {height}px; left: {leftPct}%; width: calc({widthPct}% - 2px);"
                aria-label={activity.nom}
                onclick={() => onSlotClick(slot, hasStarted)}
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
                    {formatTime(slot.startTime)} – {formatTime(slot.endTime)}
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
              <span class="h-2 w-2 -translate-x-1 rounded-full bg-epi-blue"
              ></span>
              <span class="h-px flex-1 bg-epi-blue"></span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>
