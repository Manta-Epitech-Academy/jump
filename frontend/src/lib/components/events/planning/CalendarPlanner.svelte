<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Input } from '$lib/components/ui/input';
  import {
    Plus,
    LayoutTemplate,
    Pencil,
    Trash2,
    Zap,
    FileText,
    ExternalLink,
    ClipboardCheck,
    Search,
    GripVertical,
  } from '@lucide/svelte';
  import AddTimeSlotDialog from './AddTimeSlotDialog.svelte';
  import ApplyPlanningTemplateDialog from './ApplyPlanningTemplateDialog.svelte';
  import AddActivityDialog from './AddActivityDialog.svelte';
  import type { PlanningWithSlots } from '$lib/types';
  import type { ActivityTemplate } from '@prisma/client';
  import { enhance as kitEnhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { cn } from '$lib/utils';
  import { activityTypeLabels } from '$lib/validation/templates';

  let {
    planning,
    templates,
    tsForm,
    staticActivityForm,
    templateActivityForm,
    eventId,
    eventDate,
    eventEndDate,
    planningTemplates = [],
    applyTemplateForm = null,
    timezone,
    appelRouteBase = null,
    containerClass = 'h-full min-h-[600px]',
    canEdit = true,
  }: {
    planning: PlanningWithSlots | null;
    templates: (ActivityTemplate & {
      activityTemplateThemes: { theme: { nom: string } }[];
    })[];
    tsForm: any;
    staticActivityForm: any;
    templateActivityForm: any;
    eventId: string;
    eventDate?: Date | string;
    eventEndDate?: Date | string | null;
    planningTemplates?: {
      id: string;
      nom: string;
      nbDays: number;
      description: string | null;
      _count: { days: number };
    }[];
    applyTemplateForm?: any;
    timezone: string;
    appelRouteBase?: string | null;
    containerClass?: string;
    canEdit?: boolean;
  } = $props();

  let currentTime = $state(new Date());
  let gridScrollContainer: HTMLDivElement | undefined = $state();

  onMount(() => {
    if (gridScrollContainer && slots.length > 0) {
      const earliestPx = Math.min(...slots.map((s) => getPixels(s.startTime)));
      gridScrollContainer.scrollTop = Math.max(0, earliestPx - 60);
    }

    const interval = setInterval(() => {
      currentTime = new Date();
    }, 60000);
    return () => clearInterval(interval);
  });

  const slots = $derived(planning?.timeSlots ?? []);

  // --- Dates & Grouping ---
  function getDateKey(date: Date | string): string {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });
  }

  function generateDays(start: Date | string, end: Date | string | null) {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : startDate;
    const days = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    const endMidnight = new Date(endDate);
    endMidnight.setHours(0, 0, 0, 0);

    while (current <= endMidnight) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
      if (days.length > 30) break;
    }
    return days;
  }

  const calendarDays = $derived.by(() => {
    let days: Date[] = [];
    if (eventDate) {
      days = generateDays(eventDate, eventEndDate || null);
    } else if (slots.length > 0) {
      const uniqueDates = [
        ...new Set(slots.map((s) => getDateKey(s.startTime))),
      ].sort();
      days = uniqueDates.map((d) => new Date(d));
    } else {
      days = [new Date()];
    }

    return days.map((d) => {
      const key = getDateKey(d);
      const daySlots = slots.filter((s) => getDateKey(s.startTime) === key);

      // Sort by id (identity-stable) so a slot doesn't switch columns when its
      // time changes relative to neighbours. First-fit against all slots in a
      // column (not just the last) since id-order doesn't imply time-order.
      const sorted = [...daySlots].sort((a, b) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      );
      const columns: (typeof sorted)[] = [];
      for (const slot of sorted) {
        const slotStart = new Date(slot.startTime).getTime();
        const slotEnd = new Date(slot.endTime).getTime();
        let placed = false;
        for (const col of columns) {
          const conflicts = col.some((existing) => {
            const existingStart = new Date(existing.startTime).getTime();
            const existingEnd = new Date(existing.endTime).getTime();
            return existingStart < slotEnd && slotStart < existingEnd;
          });
          if (!conflicts) {
            col.push(slot);
            placed = true;
            break;
          }
        }
        if (!placed) {
          columns.push([slot]);
        }
      }

      const numCols = columns.length || 1;
      const enrichedSlots = [];
      for (let c = 0; c < columns.length; c++) {
        for (const slot of columns[c]) {
          enrichedSlots.push({
            ...slot,
            colIndex: c,
            numCols,
          });
        }
      }

      return {
        date: d,
        dateKey: key,
        slots: enrichedSlots,
        isToday: getDateKey(currentTime) === key,
      };
    });
  });

  // --- Calendar Geometry ---
  function getHoursRange(slotsToAnalyze: any[]) {
    let minHour = 8;
    let maxHour = 20;
    for (const slot of slotsToAnalyze) {
      const start = new Date(slot.startTime).getHours();
      const end =
        new Date(slot.endTime).getHours() +
        (new Date(slot.endTime).getMinutes() > 0 ? 1 : 0);
      if (start < minHour) minHour = start;
      if (end > maxHour) maxHour = end;
    }
    return {
      start: Math.max(0, minHour - 1),
      end: Math.min(24, Math.max(minHour + 1, maxHour) + 1),
    };
  }

  const PIXELS_PER_MINUTE = 2; // 1 heure = 120px
  const range = $derived(getHoursRange(slots));
  const totalHours = $derived(range.end - range.start);

  function getPixels(time: Date | string) {
    const d = new Date(time);
    return (
      ((d.getHours() - range.start) * 60 + d.getMinutes()) * PIXELS_PER_MINUTE
    );
  }

  function getTimeFromPixels(px: number) {
    let totalMins = Math.round(px / PIXELS_PER_MINUTE);
    let h = Math.floor(totalMins / 60) + range.start;
    let m = totalMins % 60;
    if (h < 0) {
      h = 0;
      m = 0;
    }
    if (h >= 24) {
      h = 23;
      m = 59;
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // --- Pointer Drag State ---
  let dragState = $state({
    active: false,
    mode: '',
    slotId: '',
    dateKey: '',
    startY: 0,
    initialTop: 0,
    initialBottom: 0,
    currentTop: 0,
    currentBottom: 0,
  });

  let silentUpdateForm: HTMLFormElement;
  let silentPayload = $state({
    id: '',
    start: '',
    end: '',
    date: '',
    label: '',
  });

  // Dialogs
  let addSlotOpen = $state(false);
  let editSlotOpen = $state(false);
  let applyTemplateOpen = $state(false);
  let addActivityOpen = $state(false);
  let editingSlot = $state<any>(null);
  let dialogDateKey = $state('');
  let dialogSlotId = $state('');
  let dialogDefaultStartTime = $state('09:00');
  let dialogDefaultEndTime = $state('10:00');

  // Pointer interactions
  function startCreate(e: PointerEvent, dateKey: string) {
    if (!canEdit) return;
    if (e.button !== 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const snappedY =
      Math.round(y / (15 * PIXELS_PER_MINUTE)) * (15 * PIXELS_PER_MINUTE);

    dragState = {
      active: true,
      mode: 'create',
      slotId: '',
      dateKey,
      startY: e.clientY,
      initialTop: snappedY,
      initialBottom: snappedY + 60 * PIXELS_PER_MINUTE,
      currentTop: snappedY,
      currentBottom: snappedY + 60 * PIXELS_PER_MINUTE,
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function startMove(e: PointerEvent, slot: any, dateKey: string) {
    if (!canEdit) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    dragState = {
      active: true,
      mode: 'move',
      slotId: slot.id,
      dateKey,
      startY: e.clientY,
      initialTop: getPixels(slot.startTime),
      initialBottom: getPixels(slot.endTime),
      currentTop: getPixels(slot.startTime),
      currentBottom: getPixels(slot.endTime),
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function startResize(e: PointerEvent, slot: any, dateKey: string) {
    if (!canEdit) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    dragState = {
      active: true,
      mode: 'resize',
      slotId: slot.id,
      dateKey,
      startY: e.clientY,
      initialTop: getPixels(slot.startTime),
      initialBottom: getPixels(slot.endTime),
      currentTop: getPixels(slot.startTime),
      currentBottom: getPixels(slot.endTime),
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function startResizeTop(e: PointerEvent, slot: any, dateKey: string) {
    if (!canEdit) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    dragState = {
      active: true,
      mode: 'resize-top',
      slotId: slot.id,
      dateKey,
      startY: e.clientY,
      initialTop: getPixels(slot.startTime),
      initialBottom: getPixels(slot.endTime),
      currentTop: getPixels(slot.startTime),
      currentBottom: getPixels(slot.endTime),
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!dragState.active) return;
    const deltaY = e.clientY - dragState.startY;
    const snappedDelta =
      Math.round(deltaY / (15 * PIXELS_PER_MINUTE)) * (15 * PIXELS_PER_MINUTE);

    if (dragState.mode === 'create') {
      let y1 = dragState.initialTop;
      let y2 = dragState.initialTop + snappedDelta;
      dragState.currentTop = Math.max(0, Math.min(y1, y2));
      dragState.currentBottom = Math.max(
        dragState.currentTop + 15 * PIXELS_PER_MINUTE,
        Math.max(y1, y2),
      );
    } else if (dragState.mode === 'move') {
      dragState.currentTop = Math.max(0, dragState.initialTop + snappedDelta);
      const height = dragState.initialBottom - dragState.initialTop;
      dragState.currentBottom = dragState.currentTop + height;
    } else if (dragState.mode === 'resize') {
      dragState.currentBottom = Math.max(
        dragState.currentTop + 15 * PIXELS_PER_MINUTE,
        dragState.initialBottom + snappedDelta,
      );
    } else if (dragState.mode === 'resize-top') {
      dragState.currentTop = Math.max(
        0,
        Math.min(
          dragState.initialBottom - 15 * PIXELS_PER_MINUTE,
          dragState.initialTop + snappedDelta,
        ),
      );
    }
  }

  function handlePointerUp() {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);

    const start = getTimeFromPixels(dragState.currentTop);
    const end = getTimeFromPixels(dragState.currentBottom);

    if (dragState.mode === 'create') {
      dialogDateKey = dragState.dateKey;
      dialogDefaultStartTime = start;
      dialogDefaultEndTime = end;
      addSlotOpen = true;
    } else {
      const targetSlot = slots.find((s) => s.id === dragState.slotId);
      silentPayload = {
        id: dragState.slotId,
        start,
        end,
        date: dragState.dateKey,
        label: targetSlot?.label || '',
      };
      setTimeout(() => silentUpdateForm.requestSubmit(), 10);
    }

    dragState.active = false;
  }

  // --- Catalog Search ---
  let searchQuery = $state('');
  let filteredTemplates = $derived(
    templates.filter((t) =>
      t.nom.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  // --- Catalog Drag & Drop ---
  let draggedTemplateId = $state<string | null>(null);
  let dragOverSlotId = $state<string | null>(null);
  let hiddenDropForm: HTMLFormElement;
  let dropFormTemplateId = $state('');
  let dropFormSlotId = $state('');

  function handleDragStart(e: DragEvent, templateId: string) {
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', templateId);
      e.dataTransfer.effectAllowed = 'copy';
      draggedTemplateId = templateId;
    }
  }
  function handleDragEnd() {
    draggedTemplateId = null;
    dragOverSlotId = null;
  }
  function handleDragOver(e: DragEvent, slotId: string) {
    if (!canEdit) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dragOverSlotId = slotId;
  }
  function handleDragLeave(e: DragEvent, slotId: string) {
    if (dragOverSlotId === slotId) dragOverSlotId = null;
  }
  function handleDrop(e: DragEvent, slotId: string) {
    if (!canEdit) return;
    e.preventDefault();
    const templateId = e.dataTransfer?.getData('text/plain');
    dragOverSlotId = null;
    draggedTemplateId = null;

    if (templateId) {
      dropFormTemplateId = templateId;
      dropFormSlotId = slotId;
      setTimeout(() => hiddenDropForm.requestSubmit(), 10);
    }
  }
</script>

<div class={cn('flex flex-col overflow-hidden', containerClass)}>
  <!-- Top Bar -->
  <div class="mb-4 flex shrink-0 items-center justify-between px-1">
    <div class="hidden text-sm font-medium text-muted-foreground sm:block">
      Tracez sur la grille pour créer des créneaux, puis glissez-y vos activités
      depuis le catalogue !
    </div>
    {#if canEdit}
      <div class="flex w-full gap-2 sm:w-auto">
        <Button
          size="sm"
          class="flex-1 bg-epi-teal text-black hover:bg-epi-teal/80 sm:flex-none"
          onclick={() => {
            dialogDateKey = calendarDays[0]?.dateKey || getDateKey(new Date());
            dialogDefaultStartTime = '09:00';
            dialogDefaultEndTime = '10:30';
            addSlotOpen = true;
          }}
        >
          <Plus class="mr-1 h-4 w-4" /> Créneau manuel
        </Button>
        {#if planningTemplates && planningTemplates.length > 0}
          <Button
            size="sm"
            variant="outline"
            class="flex-1 sm:flex-none"
            onclick={() => (applyTemplateOpen = true)}
          >
            <LayoutTemplate class="mr-1 h-4 w-4" /> Appliquer Modèle
          </Button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Main Split Area -->
  <div
    class="flex flex-1 overflow-hidden rounded-xl border bg-card shadow-sm dark:border-border/50 dark:shadow-none"
  >
    <!-- Left: Timeline -->
    <div
      class="relative flex min-w-0 flex-1 flex-col bg-background/50 dark:bg-muted/10"
    >
      <div class="flex shrink-0 border-b border-border/50 bg-muted/30">
        <div class="w-14 shrink-0 border-r border-border/50 sm:w-16"></div>
        {#each calendarDays as day}
          <div
            class="min-w-37.5 flex-1 border-r border-border/50 py-3 text-center last:border-0 sm:min-w-50"
          >
            <div
              class={cn(
                'text-[11px] font-bold uppercase',
                day.isToday ? 'text-epi-blue' : 'text-muted-foreground',
              )}
            >
              {day.date.toLocaleDateString('fr-FR', {
                weekday: 'short',
                timeZone: timezone,
              })}
            </div>
            <div
              class={cn(
                'mx-auto mt-1 flex h-10 w-10 items-center justify-center rounded-full text-2xl font-black',
                day.isToday ? 'bg-epi-blue text-white' : 'text-foreground',
              )}
            >
              {day.date.getDate()}
            </div>
          </div>
        {/each}
      </div>

      <div
        bind:this={gridScrollContainer}
        class="min-h-0 w-full flex-1 overflow-x-auto overflow-y-auto"
      >
        <div
          class="relative flex min-w-max pb-12"
          style="height: {totalHours * 60 * PIXELS_PER_MINUTE +
            60}px; margin-top: 10px;"
        >
          <!-- Time scale -->
          <div class="relative w-14 shrink-0 border-r border-border/50 sm:w-16">
            {#each Array(totalHours + 1) as _, i}
              <div
                class="absolute w-full pr-2 text-right text-[10px] font-bold text-muted-foreground select-none"
                style="top: {i * 60 * PIXELS_PER_MINUTE - 6}px"
              >
                {(range.start + i).toString().padStart(2, '0')}:00
              </div>
            {/each}
          </div>

          <!-- Day columns -->
          {#each calendarDays as day}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="group relative min-w-37.5 flex-1 cursor-crosshair border-r border-border/50 transition-colors last:border-0 hover:bg-muted/10 sm:min-w-50"
              onpointerdown={(e) => startCreate(e, day.dateKey)}
            >
              <!-- Grid lines -->
              {#each Array(totalHours + 1) as _, i}
                <div
                  class="pointer-events-none absolute w-full border-t border-border/40"
                  style="top: {i * 60 * PIXELS_PER_MINUTE}px"
                ></div>
                <div
                  class="pointer-events-none absolute w-full border-t border-dashed border-border/20"
                  style="top: {i * 60 * PIXELS_PER_MINUTE +
                    30 * PIXELS_PER_MINUTE}px"
                ></div>
              {/each}

              <!-- Current time line -->
              {#if day.isToday}
                {@const nowPixels = getPixels(currentTime)}
                {#if nowPixels >= 0 && nowPixels <= totalHours * 60 * PIXELS_PER_MINUTE}
                  <div
                    class="pointer-events-none absolute right-0 left-0 z-20 flex items-center"
                    style="top: {nowPixels}px"
                  >
                    <div class="-ml-1 h-2 w-2 rounded-full bg-red-500"></div>
                    <div class="flex-1 border-t-2 border-red-500"></div>
                  </div>
                {/if}
              {/if}

              <!-- Render Slots -->
              {#each day.slots as slot (slot.id)}
                {#if !dragState.active || dragState.slotId !== slot.id}
                  <div
                    class={cn(
                      'group/slot absolute z-10 flex cursor-default flex-col overflow-hidden rounded-md transition-all hover:z-20',
                      dragOverSlotId === slot.id
                        ? 'z-30 scale-[1.02] border-2 border-epi-teal bg-epi-teal/20 shadow-lg ring-4 ring-epi-teal/30 dark:shadow-none'
                        : 'border-y border-r border-l-4 border-y-border border-r-border border-l-epi-blue bg-blue-50/95 text-foreground shadow-sm hover:border-l-blue-600 hover:bg-blue-50 dark:bg-blue-900/40 dark:shadow-none',
                    )}
                    style="top: {getPixels(
                      slot.startTime,
                    )}px; height: {Math.max(
                      20 * PIXELS_PER_MINUTE,
                      getPixels(slot.endTime) - getPixels(slot.startTime),
                    )}px; left: calc({(slot.colIndex / slot.numCols) *
                      100}% + 4px); width: calc({100 / slot.numCols}% - 8px);"
                    role="region"
                    aria-label="Zone de dépôt"
                    ondragover={(e) => handleDragOver(e, slot.id)}
                    ondragleave={(e) => handleDragLeave(e, slot.id)}
                    ondrop={(e) => handleDrop(e, slot.id)}
                    onpointerdown={(e) => e.stopPropagation()}
                  >
                    <!-- Top Handle: pointer-drag to resize from top -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      class="absolute top-0 z-10 flex h-2 w-full cursor-ns-resize items-center justify-center opacity-0 transition-opacity group-hover/slot:opacity-100 hover:bg-epi-blue/30"
                      onpointerdown={(e) =>
                        startResizeTop(e, slot, day.dateKey)}
                    >
                      <div class="h-1 w-6 rounded-full bg-epi-blue/50"></div>
                    </div>

                    <!-- Header -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      class="flex shrink-0 cursor-move flex-row items-center justify-between border-b border-border/10 bg-transparent px-1.5 py-1 select-none sm:px-2"
                      onpointerdown={(e) => startMove(e, slot, day.dateKey)}
                    >
                      <div
                        class="pointer-events-none flex items-center gap-1.5 overflow-hidden"
                      >
                        <span
                          class="truncate text-[10px] font-bold text-epi-blue dark:text-blue-300"
                        >
                          {formatTime(slot.startTime)} - {formatTime(
                            slot.endTime,
                          )}
                        </span>
                        {#if slot.label}
                          <span
                            class="ml-1 truncate text-[10px] font-bold text-foreground"
                          >
                            {slot.label}
                          </span>
                        {/if}
                      </div>
                      {#if canEdit}
                        <div
                          class="flex shrink-0 items-center gap-0.5 rounded-sm bg-background/50 opacity-0 backdrop-blur-sm transition-opacity group-hover/slot:opacity-100"
                          onpointerdown={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            class="h-5 w-5"
                            onclick={() => {
                              editingSlot = slot;
                              editSlotOpen = true;
                            }}
                          >
                            <Pencil class="h-2.5 w-2.5" />
                          </Button>
                          <form
                            action="?/deleteTimeSlot&id={slot.id}"
                            method="POST"
                            use:kitEnhance
                            class="shrink-0"
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              type="submit"
                              class="h-5 w-5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 class="h-2.5 w-2.5" />
                            </Button>
                          </form>
                        </div>
                      {/if}
                    </div>

                    <!-- Activities Container -->
                    <div
                      class="flex flex-1 flex-col gap-1 overflow-y-auto p-1.5"
                    >
                      {#if slot.activities.length === 0}
                        {#if canEdit}
                          <button
                            type="button"
                            class="flex min-h-6 w-full flex-1 items-center justify-center rounded border-2 border-dashed border-epi-blue/30 px-1 text-center text-[9px] font-bold tracking-widest text-epi-blue/50 uppercase transition-colors hover:border-epi-blue hover:bg-epi-blue/5 hover:text-epi-blue sm:px-2 sm:text-[10px]"
                            onpointerdown={(e) => e.stopPropagation()}
                            onclick={(e) => {
                              e.stopPropagation();
                              dialogSlotId = slot.id;
                              addActivityOpen = true;
                            }}
                          >
                            <Plus class="mr-1 h-3 w-3" /> Manuel
                          </button>
                        {/if}
                      {:else}
                        {#each slot.activities as activity (activity.id)}
                          <div
                            class="group/act relative flex flex-col gap-1 rounded border border-border/50 bg-background/80 p-1.5 shadow-xs transition-shadow hover:shadow-sm dark:shadow-none"
                          >
                            <div
                              class="flex items-start justify-between gap-1 overflow-hidden"
                            >
                              <div class="flex items-center gap-1.5 truncate">
                                {#if activity.isDynamic}<Zap
                                    class="h-3 w-3 shrink-0 text-epi-orange"
                                  />
                                {:else}<FileText
                                    class="h-3 w-3 shrink-0 text-muted-foreground"
                                  />{/if}
                                <span
                                  class="truncate text-[10px] leading-tight font-bold"
                                  >{activity.nom}</span
                                >
                              </div>
                              {#if canEdit}
                                <form
                                  action="?/deleteActivity&id={activity.id}"
                                  method="POST"
                                  use:kitEnhance
                                  class="shrink-0"
                                >
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    type="submit"
                                    class="h-4 w-4 text-destructive opacity-0 transition-opacity group-hover/act:opacity-100"
                                  >
                                    <Trash2 class="h-2.5 w-2.5" />
                                  </Button>
                                </form>
                              {/if}
                            </div>

                            <div class="mt-0.5 flex flex-wrap gap-1">
                              <Badge
                                variant="secondary"
                                class="h-auto border-transparent bg-muted px-1 py-0 text-[8px]"
                              >
                                {activityTypeLabels[
                                  activity.activityType as keyof typeof activityTypeLabels
                                ] || activity.activityType}
                              </Badge>
                              {#if activity.link}
                                <a
                                  href={activity.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  class="ml-auto shrink-0 text-muted-foreground hover:text-epi-blue"
                                >
                                  <ExternalLink class="h-3 w-3" />
                                </a>
                              {/if}
                            </div>

                            {#if activity.activityType === 'orga' && appelRouteBase}
                              <a
                                href={`${appelRouteBase}/${activity.id}`}
                                class="mt-0.5 flex items-center justify-center gap-1 rounded bg-epi-teal/10 px-1.5 py-0.5 text-[9px] font-black text-teal-700 uppercase transition-colors hover:bg-epi-teal hover:text-black dark:text-epi-teal dark:hover:text-black"
                              >
                                <ClipboardCheck class="h-3 w-3" />
                                Appel / Ops
                              </a>
                            {/if}
                          </div>
                        {/each}
                        {#if canEdit}
                          <button
                            type="button"
                            class="flex items-center justify-center gap-1.5 rounded border-2 border-dashed border-epi-blue/30 p-0.5 text-epi-blue/60 transition-colors hover:border-epi-blue hover:bg-epi-blue/5 hover:text-epi-blue"
                            onpointerdown={(e) => e.stopPropagation()}
                            onclick={(e) => {
                              e.stopPropagation();
                              dialogSlotId = slot.id;
                              addActivityOpen = true;
                            }}
                          >
                            <Plus class="h-3 w-3" />
                          </button>
                        {/if}
                      {/if}
                    </div>

                    {#if canEdit}
                      <!-- Bottom Handle: pointer-drag to resize -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        class="absolute bottom-0 flex h-2 w-full cursor-ns-resize items-center justify-center opacity-0 transition-opacity group-hover/slot:opacity-100 hover:bg-epi-blue/30"
                        onpointerdown={(e) => startResize(e, slot, day.dateKey)}
                      >
                        <div class="h-1 w-6 rounded-full bg-epi-blue/50"></div>
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}

              <!-- Draft slot during drag-create -->
              {#if dragState.active && dragState.dateKey === day.dateKey}
                <div
                  class="pointer-events-none absolute right-4 left-2 z-30 flex items-center justify-center rounded-md border-2 border-dashed border-epi-blue bg-blue-100/50 shadow-md dark:bg-blue-900/50 dark:shadow-none"
                  style="top: {dragState.currentTop}px; height: {dragState.currentBottom -
                    dragState.currentTop}px;"
                >
                  <div
                    class="rounded bg-background/80 p-1 px-2 text-center text-xs font-bold text-epi-blue backdrop-blur-sm"
                  >
                    {getTimeFromPixels(dragState.currentTop)} - {getTimeFromPixels(
                      dragState.currentBottom,
                    )}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- Right: Catalog Sidebar (drag-to-add templates) -->
    {#if canEdit}
      <div
        class="z-20 hidden w-80 shrink-0 flex-col border-l bg-card shadow-[-10px_0_15px_-5px_rgba(0,0,0,0.05)] lg:flex dark:shadow-none"
      >
        <div class="shrink-0 space-y-3 border-b p-4">
          <h3 class="font-heading text-lg tracking-wide uppercase">
            Catalogue Officiel
          </h3>
          <div class="relative">
            <Search
              class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground"
            />
            <Input
              placeholder="Rechercher un atelier..."
              class="bg-muted/50 pl-9"
              bind:value={searchQuery}
            />
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <div class="space-y-2 pr-1">
            {#each filteredTemplates as template (template.id)}
              <div
                class="relative cursor-grab rounded-lg border bg-background p-2.5 shadow-sm transition-colors hover:border-epi-teal active:cursor-grabbing dark:shadow-none"
                draggable="true"
                role="listitem"
                ondragstart={(e) => handleDragStart(e, template.id)}
                ondragend={handleDragEnd}
              >
                <div class="pointer-events-none flex items-start gap-2.5">
                  <GripVertical
                    class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50"
                  />
                  <div class="flex flex-1 flex-col gap-1">
                    <span class="text-xs leading-tight font-bold"
                      >{template.nom}</span
                    >
                    <div class="mt-0.5 flex flex-wrap gap-1">
                      <Badge
                        variant="secondary"
                        class="h-auto bg-muted px-1 py-0 text-[8px] text-muted-foreground uppercase"
                        >{template.activityType}</Badge
                      >
                      {#if template.isDynamic}<Badge
                          variant="outline"
                          class="h-auto border-epi-orange px-1 py-0 text-[8px] text-epi-orange uppercase"
                          >Dynamique</Badge
                        >{/if}
                    </div>
                  </div>
                </div>
              </div>
            {:else}
              <p class="text-center text-xs text-muted-foreground italic py-8">
                Aucun résultat trouvé.
              </p>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Hidden forms for silent drag/drop updates -->
<form
  bind:this={silentUpdateForm}
  action="?/updateTimeSlot"
  method="POST"
  class="hidden"
  use:kitEnhance={() => {
    return async ({ result, update }) => {
      if (result.type !== 'success') {
        toast.error("Erreur lors de l'enregistrement de ce créneau.");
      }
      await update();
    };
  }}
>
  <input type="hidden" name="timeSlotId" value={silentPayload.id} />
  <input type="hidden" name="startTime" value={silentPayload.start} />
  <input type="hidden" name="endTime" value={silentPayload.end} />
  <input type="hidden" name="slotDate" value={silentPayload.date} />
  <input type="hidden" name="label" value={silentPayload.label} />
</form>

<form
  bind:this={hiddenDropForm}
  action="?/addActivityFromTemplate"
  method="POST"
  class="hidden"
  use:kitEnhance={() => {
    toast.loading("Génération de l'activité...", { id: 'drop-toast' });
    return async ({ result, update }) => {
      if (result.type === 'success') {
        toast.success('Activité ajoutée !', { id: 'drop-toast' });
      } else {
        toast.error("Erreur lors de l'ajout.", { id: 'drop-toast' });
      }
      await update();
    };
  }}
>
  <input type="hidden" name="templateId" bind:value={dropFormTemplateId} />
  <input type="hidden" name="timeSlotId" bind:value={dropFormSlotId} />
</form>

<AddTimeSlotDialog
  bind:open={addSlotOpen}
  {tsForm}
  slotDate={dialogDateKey}
  defaultStartTime={dialogDefaultStartTime}
  defaultEndTime={dialogDefaultEndTime}
/>
{#if editingSlot}
  <AddTimeSlotDialog
    bind:open={editSlotOpen}
    {tsForm}
    {editingSlot}
    slotDate={getDateKey(editingSlot.startTime)}
  />
{/if}
{#if planningTemplates && planningTemplates.length > 0}
  <ApplyPlanningTemplateDialog
    bind:open={applyTemplateOpen}
    {planningTemplates}
    {applyTemplateForm}
    {planning}
  />
{/if}
{#if dialogSlotId}
  {#key dialogSlotId}
    <AddActivityDialog
      bind:open={addActivityOpen}
      timeSlotId={dialogSlotId}
      {templates}
      {staticActivityForm}
    />
  {/key}
{/if}
