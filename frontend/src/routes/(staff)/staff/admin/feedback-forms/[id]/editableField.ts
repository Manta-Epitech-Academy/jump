import { cn } from '$lib/utils';

/**
 * Shared affordance for an inline-editable text field (title, persona name,
 * option label, section title).
 *
 * The point is a RESTING cue: a faint underline visible without hovering, so the
 * field reads as editable at a glance. Authors took the rendered-looking text for
 * read-only and missed that titles, labels and messages can be changed (the old
 * styling only revealed a border on hover/focus, which a glance never triggers).
 * It strengthens on hover and turns solid foreground on focus. It stays on locked
 * forms too, where the text remains editable while the structure is frozen, so an
 * author can tell the still-editable wording from the greyed-out structure knobs.
 *
 * Block fields (the intro/outro bubbles) use a resting dashed border instead, the
 * builder's existing "dashed = editable" language, since an underline doesn't fit
 * a multi-line bubble.
 */
const EDITABLE_INLINE =
  'cursor-text border-b border-border bg-transparent outline-none transition-colors hover:border-muted-foreground focus:border-foreground';

/** `EDITABLE_INLINE` merged with field-specific classes (size, width, weight). */
export const editableInline = (...extra: string[]) =>
  cn(EDITABLE_INLINE, ...extra);
