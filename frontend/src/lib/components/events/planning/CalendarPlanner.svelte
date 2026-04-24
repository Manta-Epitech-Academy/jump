<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import {
    Plus,
    LayoutTemplate,
    Zap,
    FileText,
    ExternalLink,
    ClipboardCheck,
    Search,
    GripVertical,
    Clock,
  } from '@lucide/svelte';
  import ApplyPlanningTemplateDialog from './ApplyPlanningTemplateDialog.svelte';
  import EditActivityDialog from './EditActivityDialog.svelte';
  import AssignActivityDialog from './AssignActivityDialog.svelte';
  import ActivityPreviewDialog from './ActivityPreviewDialog.svelte';
  import type { PlanningWithSlots } from '$lib/types';
  import type { ActivityTemplate, ActivityType } from '@prisma/client';
  import { toast } from 'svelte-sonner';
  import { cn } from '$lib/utils';
  import {
    activityTypeLabels,
    activityTypeStyles,
    activityTypes,
  } from '$lib/validation/templates';
  import { enhance as kitEnhance } from '$app/forms';

  type Slot = NonNullable<PlanningWithSlots>['timeSlots'][number];

  let {
    planning,
    templates,
    planningTemplates = [],
    applyTemplateForm = null,
    eventDate,
    eventEndDate,
    timezone,
    appelRouteBase = null,
    containerClass = 'h-full min-h-[600px]',
    canEdit = true,
    canTrain = false,
    eventId = null,
  }: {
    planning: PlanningWithSlots | null;
    templates: (ActivityTemplate & {
      activityTemplateThemes: { theme: { nom: string } }[];
    })[];
    planningTemplates?: {
      id: string;
      nom: string;
      nbDays: number;
      description: string | null;
      _count: { days: number };
    }[];
    applyTemplateForm?: any;
    eventDate?: Date | string;
    eventEndDate?: Date | string | null;
    timezone: string;
    appelRouteBase?: string | null;
    containerClass?: string;
    canEdit?: boolean;
    canTrain?: boolean;
    eventId?: string | null;
  } = $props();

  // Reactive clock for current-time indicator.
  let currentTime = $state(new Date());
  let gridScrollContainer: HTMLDivElement | undefined = $state();

  // Local, optimistically mutable copy of the planning's slots. Re-seeded from
  // props whenever the server responds with fresh data.
  let localSlots = $state<Slot[]>([]);
  $effect(() => {
    const incoming = planning?.timeSlots ?? [];
    untrack(() => {
      localSlots = [...incoming];
    });
  });

  const PIXELS_PER_MINUTE = 2;

  onMount(() => {
    const interval = setInterval(() => {
      currentTime = new Date();
    }, 60000);
    return () => clearInterval(interval);
  });

  // Initial scroll to the first slot. Waits for the scroll container to have
  // non-zero size — otherwise the browser silently clamps scrollTop to 0
  // (which happens when CalendarPlanner is mounted inside an initially-hidden
  // Tabs.Content).
  let initialScrollDone = false;
  $effect(() => {
    if (initialScrollDone) return;
    if (!gridScrollContainer) return;
    if (localSlots.length === 0) return;

    const container = gridScrollContainer;
    const tryScroll = () => {
      if (initialScrollDone) return;
      if (container.clientHeight === 0) return;
      const earliestPx = Math.min(
        ...localSlots.map((s) => getPixels(s.startTime)),
      );
      container.scrollTop = Math.max(0, earliestPx - 60);
      initialScrollDone = true;
    };

    tryScroll();
    if (initialScrollDone) return;

    const observer = new ResizeObserver(() => tryScroll());
    observer.observe(container);
    return () => observer.disconnect();
  });

  // ── Date helpers ──

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

  function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
  }

  function generateDays(start: Date | string, end: Date | string | null) {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : startDate;
    const days: Date[] = [];
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

  // ── Layout: days, conflict-column bin-packing ──

  const calendarDays = $derived.by(() => {
    let days: Date[] = [];
    if (eventDate) {
      days = generateDays(eventDate, eventEndDate || null);
    } else if (localSlots.length > 0) {
      const uniqueDates = [
        ...new Set(localSlots.map((s) => getDateKey(s.startTime))),
      ].sort();
      days = uniqueDates.map((d) => new Date(d));
    } else {
      days = [new Date()];
    }

    return days.map((d) => {
      const key = getDateKey(d);
      const daySlots = localSlots.filter(
        (s) => getDateKey(s.startTime) === key,
      );

      function overlaps(a: Slot, b: Slot) {
        const sa = new Date(a.startTime).getTime();
        const ea = new Date(a.endTime).getTime();
        const sb = new Date(b.startTime).getTime();
        const eb = new Date(b.endTime).getTime();
        return sa < eb && sb < ea;
      }

      // Group slots into connected overlap components so that `numCols` is
      // local to each group — an isolated slot in the same day as overlapping
      // slots still fills its own width.
      const sorted = [...daySlots].sort((a, b) => {
        const sa = new Date(a.startTime).getTime();
        const sb = new Date(b.startTime).getTime();
        if (sa !== sb) return sa - sb;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

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

      const enrichedSlots: (Slot & { colIndex: number; numCols: number })[] =
        [];
      for (const group of groups) {
        // First-fit bin-packing within the group (sorted by id for stable
        // column assignment across time edits).
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
            enrichedSlots.push({ ...slot, colIndex: c, numCols });
          }
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

  // ── Grid geometry ──

  function getHoursRange(slots: Slot[]) {
    let minHour = 8;
    let maxHour = 20;
    for (const slot of slots) {
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
  const range = $derived(getHoursRange(localSlots));
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

  // ── Drag state ──

  type DragMode = '' | 'create' | 'move' | 'resize' | 'resize-top';
  let dragState = $state({
    active: false,
    mode: '' as DragMode,
    slotId: '',
    dateKey: '',
    startY: 0,
    initialTop: 0,
    initialBottom: 0,
    currentTop: 0,
    currentBottom: 0,
  });

  // Hidden form references + payloads
  let createForm: HTMLFormElement;
  let createEmptyForm: HTMLFormElement;
  let updateForm: HTMLFormElement;
  let renameForm: HTMLFormElement;
  let typeForm: HTMLFormElement;

  let createPayload = $state({
    slotDate: '',
    startTime: '',
    endTime: '',
    nom: '',
    activityType: 'atelier' as ActivityType,
    templateId: '',
  });
  let createEmptyPayload = $state({
    slotDate: '',
    startTime: '',
    endTime: '',
  });
  let updatePayload = $state({
    timeSlotId: '',
    slotDate: '',
    startTime: '',
    endTime: '',
  });
  let renamePayload = $state({ activityId: '', nom: '' });
  let typePayload = $state({
    activityId: '',
    activityType: 'break' as ActivityType,
  });
  let assignTemplateForm: HTMLFormElement;
  let assignTemplatePayload = $state({ timeSlotId: '', templateId: '' });
  let deleteForm: HTMLFormElement;
  let deleteSlotId = $state('');
  let pendingRollback = $state<Slot[] | null>(null);
  // Serializes optimistic mutations that share pendingRollback so a second
  // in-flight request can't overwrite the first's snapshot.
  let isSubmitting = $state(false);

  // Click-vs-drag: pointerdown on a slot starts a "maybe click, maybe move"
  // interaction. If the pointer moves past the threshold, we upgrade to a
  // move drag. Otherwise pointerup opens the action popover for the slot.
  const CLICK_DRAG_THRESHOLD = 5;
  let pendingInteraction = $state<{
    slotId: string;
    startX: number;
    startY: number;
    dateKey: string;
    armed: boolean;
  } | null>(null);

  // Slot whose preview dialog is currently open.
  let previewSlotId = $state<string | null>(null);
  let previewOpen = $state(false);
  let previewSlot = $derived(
    previewSlotId
      ? (localSlots.find((s) => s.id === previewSlotId) ?? null)
      : null,
  );
  $effect(() => {
    if (!previewOpen) previewSlotId = null;
  });

  // Ghost preview while dragging a template card from the sidebar.
  let dragGhost = $state<{
    dateKey: string | null;
    top: number;
    startTime: string;
    endTime: string;
    template:
      | (ActivityTemplate & {
          activityTemplateThemes: { theme: { nom: string } }[];
        })
      | null;
  }>({
    dateKey: null,
    top: 0,
    startTime: '',
    endTime: '',
    template: null,
  });

  // Activity dialog (full edit + assign)
  let editDialogOpen = $state(false);
  let editDialogMode = $state<'edit' | 'assign'>('edit');
  let editingActivityId = $state<string | null>(null);
  let editingSlotId = $state<string | null>(null);

  // Apply-template dialog
  let applyTemplateOpen = $state(false);

  // ── Optimistic helpers ──

  function snapshot(): Slot[] {
    return localSlots.map((s) => ({ ...s, activity: s.activity }));
  }

  function rollback(snap: Slot[]) {
    localSlots = snap;
  }

  function stubId(): string {
    return `stub_${Math.random().toString(36).slice(2, 10)}`;
  }

  // ── Pointer interactions ──

  // Whole-slot pointerdown. Decides between click → preview and drag → move.
  // Clicks always open the preview; drag-upgrade is gated on canEdit.
  function startSlotInteraction(
    e: PointerEvent,
    slot: Slot,
    dateKey: string,
    isStub: boolean,
  ) {
    if (e.button !== 0) return;
    if (isStub) return;
    e.stopPropagation();
    pendingInteraction = {
      slotId: slot.id,
      startX: e.clientX,
      startY: e.clientY,
      dateKey,
      armed: canEdit,
    };
    window.addEventListener('pointermove', onSlotInteractionMove);
    window.addEventListener('pointerup', onSlotInteractionUp);
  }

  function onSlotInteractionMove(e: PointerEvent) {
    if (!pendingInteraction) return;
    if (pendingInteraction.armed) {
      const dx = e.clientX - pendingInteraction.startX;
      const dy = e.clientY - pendingInteraction.startY;
      if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD) {
        pendingInteraction.armed = false;
        const slot = localSlots.find(
          (s) => s.id === pendingInteraction!.slotId,
        );
        if (!slot) return;
        // Upgrade to move drag — seed dragState using the slot's real position.
        dragState = {
          active: true,
          mode: 'move',
          slotId: slot.id,
          dateKey: pendingInteraction.dateKey,
          startY: pendingInteraction.startY,
          initialTop: getPixels(slot.startTime),
          initialBottom: getPixels(slot.endTime),
          currentTop: getPixels(slot.startTime),
          currentBottom: getPixels(slot.endTime),
        };
      }
    }
    if (dragState.active && dragState.mode === 'move') {
      handlePointerMove(e);
    }
  }

  function onSlotInteractionUp() {
    window.removeEventListener('pointermove', onSlotInteractionMove);
    window.removeEventListener('pointerup', onSlotInteractionUp);
    const was = pendingInteraction;
    pendingInteraction = null;
    if (!was) return;
    if (dragState.active) {
      handlePointerUp();
      return;
    }
    const slot = localSlots.find((s) => s.id === was.slotId);
    if (!slot) return;
    if (slot.activity) {
      previewSlotId = was.slotId;
      previewOpen = true;
    } else if (canEdit) {
      editingSlotId = slot.id;
      editDialogMode = 'assign';
      editDialogOpen = true;
    }
  }

  function startCreate(e: PointerEvent, dateKey: string) {
    if (!canEdit) return;
    if (e.button !== 0) return;
    // Ignore if pointer landed on a slot or control element.
    if ((e.target as HTMLElement).closest('[data-slot-block]')) return;
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

  function startMove(e: PointerEvent, slot: Slot, dateKey: string) {
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

  function startResize(e: PointerEvent, slot: Slot, dateKey: string) {
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

  function startResizeTop(e: PointerEvent, slot: Slot, dateKey: string) {
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
      const y1 = dragState.initialTop;
      const y2 = dragState.initialTop + snappedDelta;
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

  async function handlePointerUp() {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);

    const start = getTimeFromPixels(dragState.currentTop);
    const end = getTimeFromPixels(dragState.currentBottom);
    const mode = dragState.mode;
    const dateKey = dragState.dateKey;
    const slotId = dragState.slotId;
    dragState.active = false;

    if (mode === 'create') {
      await insertOptimisticStub(dateKey, start, end);
    } else if (mode === 'move' || mode === 'resize' || mode === 'resize-top') {
      submitMoveOrResize(slotId, dateKey, start, end);
    }
  }

  // ── Create flow ──
  //
  // Drag-create produces an *empty* slot (no activity). Visual + popover
  // nudge the user to assign one. Catalog template drops skip that nudge —
  // they create slot + activity in a single transaction.

  async function insertOptimisticStub(
    dateKey: string,
    startTime: string,
    endTime: string,
    template: (typeof templates)[number] | null = null,
  ) {
    const stub = buildStubSlot(dateKey, startTime, endTime, template);
    localSlots = [...localSlots, stub];

    if (template) {
      // Template drop → createSlotWithActivity (unified create).
      createPayload = {
        slotDate: dateKey,
        startTime,
        endTime,
        nom: template.nom,
        activityType: template.activityType,
        templateId: template.id,
      };
      await tick();
      createForm.requestSubmit();
    } else {
      // Manual drag → createTimeSlot (empty slot). User will assign via popover.
      createEmptyPayload = { slotDate: dateKey, startTime, endTime };
      await tick();
      createEmptyForm.requestSubmit();
    }
  }

  function buildStubSlot(
    dateKey: string,
    startTime: string,
    endTime: string,
    template: (typeof templates)[number] | null,
  ): Slot {
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    const base = new Date(dateKey);
    const start = new Date(base);
    start.setHours(sH, sM, 0, 0);
    const end = new Date(base);
    end.setHours(eH, eM, 0, 0);
    const id = stubId();
    return {
      id,
      planningId: planning?.id ?? '',
      startTime: start,
      endTime: end,
      createdAt: new Date(),
      updatedAt: new Date(),
      activity: template
        ? ({
            id: stubId(),
            nom: template.nom,
            description: template.description,
            difficulte: template.difficulte,
            activityType: template.activityType,
            isDynamic: template.isDynamic,
            link: template.link,
            content: template.content,
            contentStructure: null,
            timeSlotId: id,
            templateId: template.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            activityThemes: [],
          } as any)
        : null,
    } as Slot;
  }

  // ── Move / resize flow ──

  function submitMoveOrResize(
    slotId: string,
    dateKey: string,
    startTime: string,
    endTime: string,
  ) {
    if (isSubmitting) return;
    const target = localSlots.find((s) => s.id === slotId);
    if (!target) return;
    isSubmitting = true;
    const snap = snapshot();
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    const base = new Date(dateKey);
    const newStart = new Date(base);
    newStart.setHours(sH, sM, 0, 0);
    const newEnd = new Date(base);
    newEnd.setHours(eH, eM, 0, 0);
    localSlots = localSlots.map((s) =>
      s.id === slotId ? { ...s, startTime: newStart, endTime: newEnd } : s,
    );
    updatePayload = {
      timeSlotId: slotId,
      slotDate: dateKey,
      startTime,
      endTime,
    };
    pendingRollback = snap;
    tick().then(() => updateForm.requestSubmit());
  }

  // ── Delete ──

  async function deleteSlot(slot: Slot) {
    if (isSubmitting) return;
    isSubmitting = true;
    const snap = snapshot();
    localSlots = localSlots.filter((s) => s.id !== slot.id);
    pendingRollback = snap;
    deleteSlotId = slot.id;
    await tick();
    deleteForm.requestSubmit();
  }

  // ── Change type ──

  async function changeType(slot: Slot, newType: ActivityType) {
    if (isSubmitting) return;
    if (!slot.activity) return;
    if (slot.activity.activityType === newType) return;
    isSubmitting = true;
    const snap = snapshot();
    localSlots = localSlots.map((s) =>
      s.id === slot.id && s.activity
        ? {
            ...s,
            activity: {
              ...s.activity,
              activityType: newType,
              templateId: null,
            },
          }
        : s,
    );
    typePayload = { activityId: slot.activity.id, activityType: newType };
    pendingRollback = snap;
    await tick();
    typeForm.requestSubmit();
  }

  // ── Assign template to existing empty slot ──
  //
  // Shared by the assign-dialog catalogue tab and drop-on-empty-slot. Slot
  // size is preserved — the template's defaultDuration is ignored. Users who
  // want the template's natural duration can drop on empty grid instead.

  async function assignTemplateToSlot(
    slotId: string,
    template: (typeof templates)[number],
  ) {
    if (isSubmitting) return;
    const target = localSlots.find((s) => s.id === slotId);
    if (!target || target.activity) return;
    isSubmitting = true;
    const snap = snapshot();
    localSlots = localSlots.map((s) =>
      s.id === slotId
        ? ({
            ...s,
            activity: {
              id: stubId(),
              nom: template.nom,
              description: template.description,
              difficulte: template.difficulte,
              activityType: template.activityType,
              isDynamic: template.isDynamic,
              link: template.link,
              content: template.content,
              contentStructure: null,
              timeSlotId: slotId,
              templateId: template.id,
              createdAt: new Date(),
              updatedAt: new Date(),
              activityThemes: [],
            } as any,
          } as Slot)
        : s,
    );
    assignTemplatePayload = { timeSlotId: slotId, templateId: template.id };
    pendingRollback = snap;
    await tick();
    assignTemplateForm.requestSubmit();
  }

  // ── Catalog search (sidebar) ──

  let searchQuery = $state('');
  const filteredTemplates = $derived(
    templates.filter((t) =>
      t.nom.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  // ── Sidebar drag-drop (template → empty area creates slot+activity) ──

  let draggedTemplateId = $state<string | null>(null);
  let dragOverDayKey = $state<string | null>(null);
  // Empty slot currently hovered during a catalogue drag — drop there assigns
  // the template to that slot instead of creating a new one.
  let dragTargetSlotId = $state<string | null>(null);

  function handleDragStart(e: DragEvent, templateId: string) {
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', templateId);
      e.dataTransfer.effectAllowed = 'copy';
      draggedTemplateId = templateId;
    }
  }
  function clearDragPreview() {
    dragOverDayKey = null;
    dragTargetSlotId = null;
    dragGhost = {
      dateKey: null,
      top: 0,
      startTime: '',
      endTime: '',
      template: null,
    };
  }

  function handleDragEnd() {
    draggedTemplateId = null;
    clearDragPreview();
  }

  // Finds an empty slot on `dateKey` whose vertical extent covers pixel `y`.
  // Used to switch drop semantics from "create new slot" to "assign template
  // to existing empty slot".
  function findEmptySlotAt(dateKey: string, y: number): string | null {
    for (const s of localSlots) {
      if (s.activity) continue;
      if (getDateKey(s.startTime) !== dateKey) continue;
      const top = getPixels(s.startTime);
      const bottom = getPixels(s.endTime);
      if (y >= top && y <= bottom) return s.id;
    }
    return null;
  }

  function handleDayDragOver(e: DragEvent, dateKey: string) {
    if (!canEdit) return;
    if (!draggedTemplateId) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dragOverDayKey = dateKey;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;

    const targetSlotId = findEmptySlotAt(dateKey, y);
    if (targetSlotId) {
      // Hovering an existing empty slot — the slot itself becomes the
      // drop target; suppress the create-ghost.
      dragTargetSlotId = targetSlotId;
      dragGhost = {
        dateKey: null,
        top: 0,
        startTime: '',
        endTime: '',
        template: null,
      };
      return;
    }

    dragTargetSlotId = null;
    const snappedY =
      Math.round(y / (15 * PIXELS_PER_MINUTE)) * (15 * PIXELS_PER_MINUTE);
    const tpl = templates.find((t) => t.id === draggedTemplateId) ?? null;
    const duration = tpl?.defaultDuration ?? 60;
    dragGhost = {
      dateKey,
      top: snappedY,
      startTime: getTimeFromPixels(snappedY),
      endTime: getTimeFromPixels(snappedY + duration * PIXELS_PER_MINUTE),
      template: tpl,
    };
  }
  function handleDayDragLeave() {
    clearDragPreview();
  }
  async function handleDayDrop(e: DragEvent, dateKey: string) {
    if (!canEdit) return;
    e.preventDefault();
    const templateId = e.dataTransfer?.getData('text/plain');
    const targetSlotId = dragTargetSlotId;
    draggedTemplateId = null;
    clearDragPreview();
    if (!templateId) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;

    if (targetSlotId) {
      await assignTemplateToSlot(targetSlotId, tpl);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const snappedY =
      Math.round(y / (15 * PIXELS_PER_MINUTE)) * (15 * PIXELS_PER_MINUTE);
    const duration = tpl.defaultDuration ?? 60;
    const startTime = getTimeFromPixels(snappedY);
    const endTime = getTimeFromPixels(snappedY + duration * PIXELS_PER_MINUTE);
    await insertOptimisticStub(dateKey, startTime, endTime, tpl);
  }
</script>

<div class={cn('flex flex-col overflow-hidden', containerClass)}>
  <!-- Top Bar -->
  <div class="mb-4 flex shrink-0 items-center justify-between px-1">
    <div class="hidden text-sm font-medium text-muted-foreground sm:block">
      Cliquez-glissez sur la grille pour créer un créneau, ou déposez une
      activité du catalogue.
    </div>
    {#if canEdit && planningTemplates && planningTemplates.length > 0}
      <Button
        size="sm"
        variant="outline"
        class="ml-auto"
        onclick={() => (applyTemplateOpen = true)}
      >
        <LayoutTemplate class="mr-1 h-4 w-4" /> Appliquer un modèle
      </Button>
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
          <!-- Time gutter -->
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
              class={cn(
                'group relative min-w-37.5 flex-1 cursor-crosshair border-r border-border/50 transition-colors last:border-0 sm:min-w-50',
                dragOverDayKey === day.dateKey
                  ? 'bg-epi-teal-solid/10'
                  : 'hover:bg-muted/10',
              )}
              onpointerdown={(e) => startCreate(e, day.dateKey)}
              ondragover={(e) => handleDayDragOver(e, day.dateKey)}
              ondragleave={handleDayDragLeave}
              ondrop={(e) => handleDayDrop(e, day.dateKey)}
            >
              <!-- Hour gridlines -->
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

              <!-- Slot blocks -->
              {#each day.slots as slot (slot.id)}
                {#if !dragState.active || dragState.slotId !== slot.id}
                  {@const activity = slot.activity}
                  {@const styles =
                    activityTypeStyles[
                      (activity?.activityType ??
                        'orga') as keyof typeof activityTypeStyles
                    ]}
                  {@const isStub = slot.id.startsWith('stub_')}
                  {@const isPreviewOpen =
                    previewOpen && previewSlotId === slot.id}
                  {@const isAssignTarget = dragTargetSlotId === slot.id}
                  {@const slotHeight = Math.max(
                    20 * PIXELS_PER_MINUTE,
                    getPixels(slot.endTime) - getPixels(slot.startTime),
                  )}
                  {@const compact = slotHeight < 55}
                  {@const isClickable = !isStub && (!!activity || canEdit)}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    data-slot-block
                    class={cn(
                      'group/slot absolute z-10 flex flex-col overflow-hidden rounded-md shadow-sm transition-all hover:z-20 dark:shadow-none',
                      activity
                        ? [
                            'border-y border-r border-l-4',
                            styles.bg,
                            styles.border,
                          ]
                        : 'border-2 border-dashed border-muted-foreground/40 bg-muted/30',
                      activity && 'border-y-border border-r-border',
                      isStub && 'ring-2 ring-epi-blue/40',
                      isPreviewOpen && 'z-30 ring-2 ring-epi-blue/50',
                      isAssignTarget &&
                        'z-30 border-solid border-epi-teal-solid bg-epi-teal-solid/15 ring-2 ring-epi-teal-solid',
                      isClickable && 'cursor-pointer',
                    )}
                    style="top: {getPixels(
                      slot.startTime,
                    )}px; height: {slotHeight}px; left: calc({(slot.colIndex /
                      slot.numCols) *
                      95}% + 2px); width: calc({95 / slot.numCols}% - 4px);"
                    aria-label={activity?.nom ?? 'Créneau vide'}
                    onpointerdown={(e) =>
                      startSlotInteraction(e, slot, day.dateKey, isStub)}
                  >
                    <!-- Top resize handle -->
                    {#if canEdit && !isStub}
                      <div
                        class="absolute top-0 z-10 flex h-2 w-full cursor-ns-resize items-center justify-center opacity-0 transition-opacity group-hover/slot:opacity-100 hover:bg-epi-blue/30"
                        onpointerdown={(e) =>
                          startResizeTop(e, slot, day.dateKey)}
                      >
                        <div class="h-1 w-6 rounded-full bg-epi-blue/50"></div>
                      </div>
                    {/if}

                    <!-- Name (prominent) then time (muted). No type badge — color already shows it. -->
                    <div
                      class={cn(
                        'flex flex-1 flex-col select-none',
                        compact ? 'gap-0 px-1.5 py-0.5' : 'gap-0.5 p-1.5',
                      )}
                    >
                      {#if activity}
                        <span
                          class={cn(
                            'text-[11px] leading-tight font-bold break-words',
                            styles.text,
                          )}
                        >
                          {activity.nom || 'Sans nom'}
                        </span>
                      {:else if isAssignTarget && dragGhost.template === null && draggedTemplateId}
                        {@const incoming = templates.find(
                          (t) => t.id === draggedTemplateId,
                        )}
                        <span
                          class="text-[11px] leading-tight font-bold break-words text-epi-teal-solid"
                        >
                          {incoming?.nom ?? 'Assigner ici'}
                        </span>
                      {:else}
                        <span
                          class="text-[11px] leading-tight font-medium text-muted-foreground italic"
                        >
                          À assigner
                        </span>
                      {/if}

                      <div class="flex items-center gap-1">
                        {#if activity?.isDynamic}
                          <Zap class="h-2.5 w-2.5 shrink-0 text-epi-orange" />
                        {/if}
                        <span
                          class={cn(
                            'text-[9px] font-medium whitespace-nowrap',
                            activity
                              ? 'text-muted-foreground'
                              : 'text-muted-foreground/70',
                          )}
                        >
                          {formatTime(slot.startTime)} – {formatTime(
                            slot.endTime,
                          )}
                        </span>
                        {#if activity?.link}
                          <a
                            href={activity.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="ml-auto shrink-0 text-muted-foreground hover:text-epi-blue"
                            onpointerdown={(e) => e.stopPropagation()}
                            onclick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink class="h-3 w-3" />
                          </a>
                        {/if}
                      </div>

                      {#if activity?.activityType === 'orga' && appelRouteBase && !isStub}
                        <a
                          href={`${appelRouteBase}/${activity.id}`}
                          class="mt-0.5 flex items-center justify-center gap-1 rounded bg-epi-teal-solid/10 px-1.5 py-0.5 text-[9px] font-black text-epi-teal-solid uppercase transition-colors hover:bg-epi-teal-solid hover:text-white"
                          onpointerdown={(e) => e.stopPropagation()}
                          onclick={(e) => e.stopPropagation()}
                        >
                          <ClipboardCheck class="h-3 w-3" />
                          Appel / Ops
                        </a>
                      {/if}
                    </div>

                    <!-- Bottom resize handle -->
                    {#if canEdit && !isStub}
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

              <!-- Ghost preview for catalog drag-over -->
              {#if dragGhost.template && dragGhost.dateKey === day.dateKey}
                {@const gs =
                  activityTypeStyles[
                    dragGhost.template
                      .activityType as keyof typeof activityTypeStyles
                  ]}
                <div
                  class={cn(
                    'pointer-events-none absolute z-30 flex flex-col gap-0.5 rounded-md border-y border-r border-l-4 p-1.5 opacity-80 shadow-md dark:shadow-none',
                    gs.bg,
                    gs.border,
                    'border-y-border border-r-border',
                  )}
                  style="top: {dragGhost.top}px; height: {(dragGhost.template
                    .defaultDuration ?? 60) *
                    PIXELS_PER_MINUTE}px; left: 2px; width: calc(95% - 4px);"
                >
                  <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span class={cn('text-[10px] font-bold', gs.accent)}>
                      {dragGhost.startTime} – {dragGhost.endTime}
                    </span>
                    <span
                      class={cn(
                        'rounded border px-1 py-0 text-[8px] font-bold uppercase',
                        gs.bg,
                        gs.accent,
                      )}
                    >
                      {activityTypeLabels[
                        dragGhost.template
                          .activityType as keyof typeof activityTypeLabels
                      ]}
                    </span>
                  </div>
                  <div class="flex items-start gap-1">
                    {#if dragGhost.template.isDynamic}
                      <Zap class="mt-0.5 h-3 w-3 shrink-0 text-epi-orange" />
                    {:else}
                      <FileText
                        class="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
                      />
                    {/if}
                    <span
                      class={cn(
                        'text-[10px] leading-tight font-bold break-words',
                        gs.text,
                      )}
                    >
                      {dragGhost.template.nom}
                    </span>
                  </div>
                </div>
              {/if}

              <!-- Draft preview during create / move / resize -->
              {#if dragState.active && dragState.dateKey === day.dateKey}
                <div
                  class="pointer-events-none absolute z-30 flex items-center justify-center rounded-md border-2 border-dashed border-epi-blue bg-blue-100/50 shadow-md dark:bg-blue-900/50 dark:shadow-none"
                  style="top: {dragState.currentTop}px; height: {dragState.currentBottom -
                    dragState.currentTop}px; left: 2px; width: calc(95% - 4px);"
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

    <!-- Right: Catalog Sidebar -->
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
              {@const s =
                activityTypeStyles[
                  template.activityType as keyof typeof activityTypeStyles
                ]}
              <div
                class={cn(
                  'relative cursor-grab rounded-lg border bg-background p-2.5 shadow-sm transition-colors active:cursor-grabbing dark:shadow-none',
                  draggedTemplateId === template.id &&
                    'ring-2 ring-epi-teal-solid',
                )}
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
                    <div class="mt-0.5 flex flex-wrap items-center gap-1">
                      <span
                        class={cn(
                          'rounded border px-1 py-0 text-[8px] font-bold uppercase',
                          s.bg,
                          s.accent,
                        )}
                      >
                        {activityTypeLabels[
                          template.activityType as keyof typeof activityTypeLabels
                        ] || template.activityType}
                      </span>
                      {#if template.isDynamic}
                        <span
                          class="rounded border border-epi-orange px-1 py-0 text-[8px] font-bold text-epi-orange uppercase"
                          >Dynamique</span
                        >
                      {/if}
                      {#if template.defaultDuration}
                        <span
                          class="flex items-center gap-0.5 text-[9px] font-medium text-muted-foreground"
                        >
                          <Clock class="h-2.5 w-2.5" />
                          {formatDuration(template.defaultDuration)}
                        </span>
                      {/if}
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

<!-- Hidden optimistic forms -->
<form
  bind:this={createForm}
  action="?/createSlotWithActivity"
  method="POST"
  class="hidden"
  use:kitEnhance={() => {
    return async ({ result, update }) => {
      if (result.type !== 'success') {
        toast.error('Erreur lors de la création du créneau.');
      }
      await update({ reset: false });
    };
  }}
>
  <input type="hidden" name="slotDate" value={createPayload.slotDate} />
  <input type="hidden" name="startTime" value={createPayload.startTime} />
  <input type="hidden" name="endTime" value={createPayload.endTime} />
  <input type="hidden" name="nom" value={createPayload.nom} />
  <input type="hidden" name="activityType" value={createPayload.activityType} />
  <input type="hidden" name="templateId" value={createPayload.templateId} />
</form>

<form
  bind:this={createEmptyForm}
  action="?/createTimeSlot"
  method="POST"
  class="hidden"
  use:kitEnhance={() => {
    return async ({ result, update }) => {
      if (result.type !== 'success') {
        toast.error('Erreur lors de la création du créneau.');
      }
      await update({ reset: false });
    };
  }}
>
  <input type="hidden" name="slotDate" value={createEmptyPayload.slotDate} />
  <input type="hidden" name="startTime" value={createEmptyPayload.startTime} />
  <input type="hidden" name="endTime" value={createEmptyPayload.endTime} />
</form>

<form
  bind:this={updateForm}
  action="?/updateTimeSlot"
  method="POST"
  class="hidden"
  use:kitEnhance={() => {
    return async ({ result, update }) => {
      if (result.type !== 'success' && pendingRollback) {
        rollback(pendingRollback);
        toast.error("Erreur lors de l'enregistrement du créneau.");
      }
      pendingRollback = null;
      isSubmitting = false;
      await update({ reset: false });
    };
  }}
>
  <input type="hidden" name="timeSlotId" value={updatePayload.timeSlotId} />
  <input type="hidden" name="startTime" value={updatePayload.startTime} />
  <input type="hidden" name="endTime" value={updatePayload.endTime} />
  <input type="hidden" name="slotDate" value={updatePayload.slotDate} />
</form>

<form
  bind:this={renameForm}
  action="?/renameActivity"
  method="POST"
  class="hidden"
  use:kitEnhance={() => {
    return async ({ result, update }) => {
      if (result.type !== 'success' && pendingRollback) {
        rollback(pendingRollback);
        toast.error('Erreur lors du renommage.');
      }
      pendingRollback = null;
      isSubmitting = false;
      await update({ reset: false });
    };
  }}
>
  <input type="hidden" name="activityId" value={renamePayload.activityId} />
  <input type="hidden" name="nom" value={renamePayload.nom} />
</form>

<form
  bind:this={typeForm}
  action="?/changeActivityType"
  method="POST"
  class="hidden"
  use:kitEnhance={() => {
    return async ({ result, update }) => {
      if (result.type !== 'success' && pendingRollback) {
        rollback(pendingRollback);
        toast.error('Erreur lors du changement de type.');
      }
      pendingRollback = null;
      isSubmitting = false;
      await update({ reset: false });
    };
  }}
>
  <input type="hidden" name="activityId" value={typePayload.activityId} />
  <input type="hidden" name="activityType" value={typePayload.activityType} />
</form>

<form
  bind:this={deleteForm}
  action="?/deleteTimeSlot&id={deleteSlotId}"
  method="POST"
  class="hidden"
  use:kitEnhance={() => {
    return async ({ result, update }) => {
      if (result.type !== 'success' && pendingRollback) {
        rollback(pendingRollback);
        toast.error('Erreur lors de la suppression.');
      }
      pendingRollback = null;
      isSubmitting = false;
      await update({ reset: false });
    };
  }}
></form>

<form
  bind:this={assignTemplateForm}
  action="?/assignActivity"
  method="POST"
  class="hidden"
  use:kitEnhance={() => {
    return async ({ result, update }) => {
      if (result.type !== 'success' && pendingRollback) {
        rollback(pendingRollback);
        toast.error("Erreur lors de l'assignation.");
      }
      pendingRollback = null;
      isSubmitting = false;
      await update({ reset: false });
    };
  }}
>
  <input
    type="hidden"
    name="timeSlotId"
    value={assignTemplatePayload.timeSlotId}
  />
  <input
    type="hidden"
    name="templateId"
    value={assignTemplatePayload.templateId}
  />
</form>

{#if planningTemplates && planningTemplates.length > 0}
  <ApplyPlanningTemplateDialog
    bind:open={applyTemplateOpen}
    {planningTemplates}
    {applyTemplateForm}
    {planning}
  />
{/if}

{#if editDialogOpen}
  {#if editDialogMode === 'edit' && editingActivityId}
    {@const editedSlot = localSlots.find(
      (s) => s.activity?.id === editingActivityId,
    )}
    {#if editedSlot && editedSlot.activity}
      <EditActivityDialog
        bind:open={editDialogOpen}
        activity={editedSlot.activity}
        onClose={() => {
          editDialogOpen = false;
          editingActivityId = null;
        }}
      />
    {/if}
  {:else if editDialogMode === 'assign' && editingSlotId}
    <AssignActivityDialog
      bind:open={editDialogOpen}
      timeSlotId={editingSlotId}
      {templates}
      onClose={() => {
        editDialogOpen = false;
        editingSlotId = null;
      }}
      onDelete={() => {
        const target = localSlots.find((s) => s.id === editingSlotId);
        editDialogOpen = false;
        editingSlotId = null;
        if (target) deleteSlot(target);
      }}
      onAssignTemplate={(template) => {
        const slotId = editingSlotId;
        editDialogOpen = false;
        editingSlotId = null;
        if (slotId) assignTemplateToSlot(slotId, template);
      }}
    />
  {/if}
{/if}

<ActivityPreviewDialog
  bind:open={previewOpen}
  slot={previewSlot}
  {timezone}
  {canEdit}
  {canTrain}
  {eventId}
  onEdit={() => {
    if (!previewSlot?.activity) return;
    editingActivityId = previewSlot.activity.id;
    editDialogMode = 'edit';
    editDialogOpen = true;
  }}
  onDelete={() => {
    if (!previewSlot) return;
    deleteSlot(previewSlot);
  }}
/>
