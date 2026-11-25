<!--
  What EpiDuck says, drawn as a comic's speech bubble (#540): a card with a
  tail that points at him, so the words are his and not the page's. One
  bubble wherever he speaks (the header, his stage, the welcome screen, the
  check-in): a character with a different way of talking on every screen
  reads as several.

  It draws nothing of its own state. Where it stands, how it enters and what
  a screen reader hears of it are the host's: the header's lane keeps one
  live region for all he says, the stage another.

  The tail is a square turned a quarter, under the card's edge, outlined on
  the two sides that stand out of it.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '#lib/utils.ts';

  let {
    tail = 'top',
    tailAt = 'center',
    size = 'md',
    class: className,
    children,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    /** The edge he is on: above the bubble, or under it. */
    tail?: 'top' | 'bottom';
    /** Where along that edge he is, for a bubble pinned to a screen edge. */
    tailAt?: 'start' | 'center' | 'end';
    /** `sm` in the header, `md` everywhere he is drawn large. */
    size?: 'sm' | 'md';
    children: Snippet;
  } = $props();
</script>

<div
  {...rest}
  class={cn(
    'relative rounded-xl border-2 border-primary bg-card font-mono font-bold text-primary shadow-overlay',
    // The line height after the size, which sets one of its own.
    size === 'sm'
      ? 'px-3 py-2 text-xs leading-snug'
      : 'px-4 py-3 text-sm leading-snug',
    className,
  )}
>
  {@render children()}
  <span
    aria-hidden="true"
    class={cn(
      'absolute size-3 rotate-45 bg-card',
      tail === 'top'
        ? '-top-1.75 border-t-2 border-l-2 border-primary'
        : '-bottom-1.75 border-r-2 border-b-2 border-primary',
      tailAt === 'start'
        ? 'left-4.5'
        : tailAt === 'end'
          ? 'right-4.5'
          : 'left-1/2 -translate-x-1/2',
    )}
  ></span>
</div>
