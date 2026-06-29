import type { Action } from 'svelte/action';

/**
 * Minimal handle-armed drag-to-reorder for a list, with no dependency.
 *
 * Applied to the list container. Each reorderable child carries `data-sort-id`;
 * dragging is initiated only from a `[data-drag-handle]` inside it, so the rest
 * of the row (inputs, text) keeps native selection. The list reorders *live* on
 * drag-over (`onMove`) and the move is persisted once, on drop (`onCommit`).
 *
 * Lists nest (options inside a question inside the question list): items are
 * scoped to the nearest `[data-sortable-root]`, so a parent list never grabs a
 * child list's rows.
 */
export interface SortableParams {
  disabled?: boolean;
  /** Fired on drag start, before any move: snapshot the order here for rollback. */
  onStart?: () => void;
  /** Fired continuously while dragging: move `fromId` to `overId`'s slot (local only). */
  onMove: (fromId: string, overId: string) => void;
  /** Fired once on drop: persist the current order. */
  onCommit: () => void;
}

export const sortable: Action<HTMLElement, SortableParams> = (node, params) => {
  let opts = params;
  node.setAttribute('data-sortable-root', '');

  let draggingId: string | null = null;
  let armedItem: HTMLElement | null = null;

  const itemFor = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const item = target.closest<HTMLElement>('[data-sort-id]');
    if (!item || item.closest('[data-sortable-root]') !== node) return null;
    return item;
  };

  const disarm = () => {
    armedItem?.removeAttribute('draggable');
    armedItem = null;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (opts.disabled) return;
    const handle = (e.target as Element | null)?.closest('[data-drag-handle]');
    if (!handle) return;
    const item = itemFor(handle);
    if (!item) return;
    item.setAttribute('draggable', 'true');
    armedItem = item;
  };

  const onDragStart = (e: DragEvent) => {
    const item = itemFor(e.target);
    if (!item || item !== armedItem) return; // not from our handle
    draggingId = item.dataset.sortId ?? null;
    if (!draggingId) return;
    item.classList.add('opacity-40');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggingId);
    }
    opts.onStart?.();
  };

  const onDragOver = (e: DragEvent) => {
    if (draggingId === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  };

  const onDragEnter = (e: DragEvent) => {
    if (draggingId === null) return;
    const overId = itemFor(e.target)?.dataset.sortId;
    if (!overId || overId === draggingId) return;
    opts.onMove(draggingId, overId);
  };

  const onDragEnd = () => {
    const wasDragging = draggingId !== null;
    node
      .querySelectorAll('[data-sort-id].opacity-40')
      .forEach((el) => el.classList.remove('opacity-40'));
    draggingId = null;
    disarm();
    if (wasDragging) opts.onCommit();
  };

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointerup', disarm);
  node.addEventListener('dragstart', onDragStart);
  node.addEventListener('dragover', onDragOver);
  node.addEventListener('dragenter', onDragEnter);
  node.addEventListener('dragend', onDragEnd);

  return {
    update(next: SortableParams) {
      opts = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointerup', disarm);
      node.removeEventListener('dragstart', onDragStart);
      node.removeEventListener('dragover', onDragOver);
      node.removeEventListener('dragenter', onDragEnter);
      node.removeEventListener('dragend', onDragEnd);
    },
  };
};
