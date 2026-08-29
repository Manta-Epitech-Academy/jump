<script lang="ts">
  import { cn } from '$lib/utils.js';
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { useResponsiveDialog } from './context.js';

  // Main region of the panel; where scrolling happens differs per platform.
  //
  // Desktop: the dialog `Content` is a grid and owns the scroll (a grid child
  // can't scroll against an auto-sized row), so here the body is a padded
  // passthrough.
  //
  // Mobile: the drawer `Content` is the vaul drag target, scrolling it fights
  // the dismiss gesture, so the scroll must live on an inner flex child. The
  // body becomes that child (`flex-1 min-h-0 overflow-y-auto`) and adds the
  // horizontal padding the edge-to-edge drawer lacks plus a bottom inset.
  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> & {
    ref?: HTMLDivElement | null;
    children: Snippet;
  } = $props();

  const ctx = useResponsiveDialog();
</script>

<div
  bind:this={ref}
  data-slot="responsive-dialog-body"
  class={cn(
    ctx.isDesktop ? '' : 'min-h-0 flex-1 overflow-y-auto px-4 pb-6',
    className,
  )}
  {...restProps}
>
  {@render children()}
</div>
