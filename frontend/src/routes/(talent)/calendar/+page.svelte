<script lang="ts">
  import type { PageData } from './$types';
  import { onMount, untrack } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { resolve } from '$app/paths';
  import { ArrowLeft, ChevronLeft, ChevronRight, Zap } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { activityTypeStyles } from '$lib/validation/templates';
  import ActivitySummaryDialog from '$lib/components/talent/ActivitySummaryDialog.svelte';

  let { data }: { data: PageData } = $props();

  let event = $derived(data.participation.event);
  let timeSlots = $derived(event.planning?.timeSlots ?? []);

  type Slot = (typeof timeSlots)[number];

  const PIXELS_PER_MINUTE = 1.2;
  const DAY_MS = 86_400_000;
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

  let eventStart = $derived(startOfDay(new Date(event.date)));
  let eventEnd = $derived(
    event.endDate ? startOfDay(new Date(event.endDate)) : eventStart,
  );

  function pickInitialWeek(ts: number, start: Date, end: Date): Date {
    const today = startOfDay(new Date(ts));
    return startOfWeek(today >= start && today <= end ? today : start);
  }

  let weekStart = $state<Date>(
    untrack(() =>
      pickInitialWeek(
        data.serverNow,
        startOfDay(new Date(event.date)),
        event.endDate
          ? startOfDay(new Date(event.endDate))
          : startOfDay(new Date(event.date)),
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

  // A day is in-range if it falls within the event window.
  function dayInEvent(d: Date): boolean {
    return d >= eventStart && d <= eventEnd;
  }

  let canGoPrev = $derived(weekDays[6] > eventStart);
  let canGoNext = $derived(weekDays[0] < eventEnd);

  let previewSlot = $state<Slot | null>(null);
  let previewHasStarted = $state(false);
  let previewOpen = $state(false);
  $effect(() => {
    if (!previewOpen) previewSlot = null;
  });

  function openPreview(slot: Slot) {
    previewSlot = slot;
    previewHasStarted = new Date(slot.startTime).getTime() <= nowTime.getTime();
    previewOpen = true;
  }

  function prevWeek() {
    if (!canGoPrev) return;
    const n = new Date(weekStart);
    n.setDate(n.getDate() - 7);
    weekStart = n;
  }
  function nextWeek() {
    if (!canGoNext) return;
    const n = new Date(weekStart);
    n.setDate(n.getDate() + 7);
    weekStart = n;
  }

  // Build a map day→slots only for slots falling in the visible week.
  type PackedSlot = Slot & { colIndex: number; numCols: number };

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
      const groupSorted = [...group].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      );
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
          out.push({ ...slot, colIndex: c, numCols });
        }
      }
    }
    return out;
  }

  let slotsByDay = $derived.by(() => {
    const map = new Map<number, PackedSlot[]>();
    const weekStartMs = weekStart.getTime();
    const weekEndMs = weekStartMs + 7 * DAY_MS;
    const byDay = new Map<number, Slot[]>();
    for (const s of timeSlots) {
      const t = new Date(s.startTime).getTime();
      if (t < weekStartMs || t >= weekEndMs) continue;
      const dayIdx = Math.floor((t - weekStartMs) / DAY_MS);
      const arr = byDay.get(dayIdx) ?? [];
      arr.push(s);
      byDay.set(dayIdx, arr);
    }
    for (const [dayIdx, slots] of byDay) {
      map.set(dayIdx, packOverlaps(slots));
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
  <title>Calendrier</title>
</svelte:head>

<div
  class="flex h-screen flex-col overflow-hidden bg-slate-50 dark:bg-slate-950"
>
  <header
    class="shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:px-8 dark:border-slate-800 dark:bg-slate-900"
  >
    <Button
      variant="ghost"
      size="sm"
      href={resolve('/')}
      class="mb-3 -ml-2 text-xs font-bold text-slate-500 uppercase"
    >
      <ArrowLeft class="mr-1 h-3.5 w-3.5" /> Retour au cockpit
    </Button>
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1
          class="font-heading text-2xl tracking-tight text-slate-900 uppercase sm:text-3xl dark:text-white"
        >
          Calendrier<span class="text-epi-teal">_</span>
        </h1>
        <p class="mt-1 text-xs font-medium text-slate-500">{event.titre}</p>
      </div>
      <div class="flex items-center gap-1">
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
      </div>
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-hidden bg-white dark:bg-slate-900">
    <div class="flex h-full flex-col">
      <!-- Day header row -->
      <div
        class="grid shrink-0 border-b border-slate-200 dark:border-slate-800"
        style="grid-template-columns: 3rem repeat(7, minmax(0, 1fr));"
      >
        <div></div>
        {#each weekDays as d, i (i)}
          {@const inRange = dayInEvent(d)}
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
            {@const inRange = dayInEvent(d)}
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
                  {@const widthPct = 98 / slot.numCols}
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
  </div>
</div>

<ActivitySummaryDialog
  bind:open={previewOpen}
  slot={previewSlot}
  hasStarted={previewHasStarted}
/>
