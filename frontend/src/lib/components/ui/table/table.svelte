<script lang="ts">
  import type { HTMLTableAttributes } from 'svelte/elements';
  import { cn, type WithElementRef } from '$lib/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    containerClass,
    children,
    ...restProps
  }: WithElementRef<HTMLTableAttributes> & {
    containerClass?: string;
  } = $props();
</script>

<!-- The container scrolls horizontally by default so a wide table never blows
     out the page. `containerClass` lets a caller relax that on a breakpoint:
     e.g. a sticky-header table passes `lg:overflow-visible` so the header pins
     to the page on desktop, while mobile keeps the contained x-scroll. -->
<div
  data-slot="table-container"
  class={cn('relative w-full overflow-x-auto', containerClass)}
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
