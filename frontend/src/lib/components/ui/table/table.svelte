<script lang="ts">
  import type { HTMLTableAttributes } from 'svelte/elements';
  import { cn, type WithElementRef } from '$lib/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    scrollable = true,
    children,
    ...restProps
  }: WithElementRef<HTMLTableAttributes> & { scrollable?: boolean } = $props();
</script>

<!-- The container scrolls horizontally by default so wide tables never blow out
     the layout. Pass `scrollable={false}` when the table carries a `sticky`
     header: the overflow box is itself a scroll container, so it would capture
     the sticky instead of letting it pin against the page's real scroller. -->
<div
  data-slot="table-container"
  class={cn('relative w-full', scrollable && 'overflow-x-auto')}
>
  <table
    bind:this={ref}
    data-slot="table"
    class={cn('w-full caption-bottom text-sm', className)}
    {...restProps}
  >
    {@render children?.()}
  </table>
</div>
