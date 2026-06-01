<script lang="ts">
  import { cn } from '$lib/utils';
  import { Badge } from '$lib/components/ui/badge';
  import Zap from '@lucide/svelte/icons/zap';
  import FileText from '@lucide/svelte/icons/file-text';
  import {
    activityTypeLabels,
    activityTypeStyles,
  } from '$lib/validation/templates';

  type Slot = {
    id: string;
    startTime: string;
    endTime: string;
    sortOrder: number;
    activityType: string;
    nom: string | null;
    activityTemplate: {
      nom: string;
      isDynamic: boolean;
      difficulte: string | null;
      activityType: string;
    } | null;
  };

  type Props = {
    slots: Slot[];
    onSlotClick: (slotId: string) => void;
    onEmptyClick: (time: string) => void;
  };

  let { slots, onSlotClick, onEmptyClick }: Props = $props();

  const PX_PER_MIN = 1.1;
  const DEFAULT_START = 9;
  const DEFAULT_END = 18;
  const SNAP_MINUTES = 15;

  function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  function minutesToTime(m: number): string {
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  // Compute visible hour range: default 9-17, expand if slots overflow
  let range = $derived.by(() => {
    let start = DEFAULT_START;
    let end = DEFAULT_END;
    for (const s of slots) {
      const sMin = timeToMinutes(s.startTime);
      const eMin = timeToMinutes(s.endTime);
      if (sMin < start * 60) start = Math.floor(sMin / 60);
      if (eMin > end * 60) end = Math.ceil(eMin / 60);
    }
    return { start, end };
  });

  let totalMinutes = $derived((range.end - range.start) * 60);
  let containerHeight = $derived(totalMinutes * PX_PER_MIN);

  let hours = $derived(
    Array.from(
      { length: range.end - range.start + 1 },
      (_, i) => range.start + i,
    ),
  );

  function getTop(time: string): number {
    return (timeToMinutes(time) - range.start * 60) * PX_PER_MIN;
  }

  function getHeight(start: string, end: string): number {
    const h = (timeToMinutes(end) - timeToMinutes(start)) * PX_PER_MIN;
    return Math.max(h, 15 * PX_PER_MIN); // min height
  }

  // Column bin-packing for overlapping slots
  type LayoutSlot = Slot & { colIndex: number; numCols: number };

  let layoutSlots = $derived.by((): LayoutSlot[] => {
    if (slots.length === 0) return [];

    const sorted = [...slots].sort(
      (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
    );

    // Build overlap groups
    const groups: Slot[][] = [];
    let currentGroup: Slot[] = [sorted[0]];
    let groupEnd = timeToMinutes(sorted[0].endTime);

    for (let i = 1; i < sorted.length; i++) {
      const s = sorted[i];
      if (timeToMinutes(s.startTime) < groupEnd) {
        currentGroup.push(s);
        groupEnd = Math.max(groupEnd, timeToMinutes(s.endTime));
      } else {
        groups.push(currentGroup);
        currentGroup = [s];
        groupEnd = timeToMinutes(s.endTime);
      }
    }
    groups.push(currentGroup);

    // Assign columns within each group
    const result: LayoutSlot[] = [];
    for (const group of groups) {
      const columns: Slot[][] = [];
      for (const slot of group) {
        let placed = false;
        for (let c = 0; c < columns.length; c++) {
          const last = columns[c][columns[c].length - 1];
          if (timeToMinutes(last.endTime) <= timeToMinutes(slot.startTime)) {
            columns[c].push(slot);
            result.push({ ...slot, colIndex: c, numCols: 0 });
            placed = true;
            break;
          }
        }
        if (!placed) {
          columns.push([slot]);
          result.push({ ...slot, colIndex: columns.length - 1, numCols: 0 });
        }
      }
      // Set numCols for all slots in this group
      const numCols = columns.length;
      for (const r of result) {
        if (group.some((s) => s.id === r.id)) {
          r.numCols = numCols;
        }
      }
    }
    return result;
  });

  function handleContainerClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('[data-slot]')) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const rawMinutes = offsetY / PX_PER_MIN + range.start * 60;
    const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
    onEmptyClick(minutesToTime(Math.max(0, Math.min(snapped, 23 * 60 + 45))));
  }
</script>

<div class="flex select-none">
  <!-- Hour gutter -->
  <div class="relative w-14 shrink-0" style="height: {containerHeight}px;">
    {#each hours as hour}
      <span
        class="absolute right-2 text-[10px] font-bold text-muted-foreground"
        style="top: {(hour - range.start) * 60 * PX_PER_MIN - 6}px;"
      >
        {String(hour).padStart(2, '0')}:00
      </span>
    {/each}
  </div>

  <!-- Timeline grid -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="relative flex-1 cursor-crosshair rounded-md border"
    style="height: {containerHeight}px;"
    onclick={handleContainerClick}
  >
    <!-- Hour lines -->
    {#each hours as hour, i}
      {#if i < hours.length - 1}
        <div
          class="absolute right-0 left-0 border-t border-border/40"
          style="top: {(hour - range.start) * 60 * PX_PER_MIN}px;"
        ></div>
        <!-- Half-hour line -->
        <div
          class="absolute right-0 left-0 border-t border-dashed border-border/20"
          style="top: {(hour - range.start) * 60 * PX_PER_MIN +
            30 * PX_PER_MIN}px;"
        ></div>
      {/if}
    {/each}

    <!-- Grey zones outside 9-17 -->
    {#if range.start < DEFAULT_START}
      <div
        class="pointer-events-none absolute top-0 right-0 left-0 bg-muted/40 dark:bg-muted/20"
        style="height: {(DEFAULT_START - range.start) * 60 * PX_PER_MIN}px;"
      ></div>
    {/if}
    {#if range.end > DEFAULT_END}
      <div
        class="pointer-events-none absolute right-0 bottom-0 left-0 bg-muted/40 dark:bg-muted/20"
        style="height: {(range.end - DEFAULT_END) * 60 * PX_PER_MIN}px;"
      ></div>
    {/if}

    <!-- Slot blocks -->
    {#each layoutSlots as slot}
      {@const styles =
        activityTypeStyles[
          slot.activityType as keyof typeof activityTypeStyles
        ]}
      {@const name = slot.activityTemplate?.nom ?? slot.nom ?? 'Sans nom'}
      {@const h = getHeight(slot.startTime, slot.endTime)}
      {@const compact = h < 40}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        data-slot
        class={cn(
          'absolute cursor-pointer overflow-hidden rounded-md border-l-4 px-2 py-1 transition-opacity hover:opacity-80',
          styles?.bg,
          styles?.border,
        )}
        style="top: {getTop(
          slot.startTime,
        )}px; height: {h}px; left: calc({(slot.colIndex / slot.numCols) *
          95}% + 4px); width: calc({95 / slot.numCols}% - 8px);"
        onclick={() => onSlotClick(slot.id)}
      >
        {#if compact}
          <div class="flex items-center gap-1.5 truncate">
            <span class="font-mono text-[10px] text-muted-foreground"
              >{slot.startTime}</span
            >
            <span class="truncate text-xs font-bold">{name}</span>
          </div>
        {:else}
          <div class="font-mono text-[10px] text-muted-foreground">
            {slot.startTime} - {slot.endTime}
          </div>
          <div class="mt-0.5 flex items-center gap-1.5">
            {#if slot.activityTemplate}
              {#if slot.activityTemplate.isDynamic}
                <Zap class="h-3 w-3 shrink-0 text-epi-orange" />
              {:else}
                <FileText class="h-3 w-3 shrink-0 text-muted-foreground" />
              {/if}
            {/if}
            <span class="truncate text-xs font-bold">{name}</span>
          </div>
          <div class="mt-0.5 flex items-center gap-1">
            <Badge
              variant="outline"
              class="text-[9px] leading-tight {styles?.accent}"
            >
              {activityTypeLabels[
                slot.activityType as keyof typeof activityTypeLabels
              ]}
            </Badge>
            {#if slot.activityTemplate?.difficulte}
              <Badge variant="secondary" class="text-[9px] leading-tight">
                {slot.activityTemplate.difficulte}
              </Badge>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
