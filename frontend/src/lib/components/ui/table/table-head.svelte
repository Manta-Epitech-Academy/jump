<script lang="ts">
  import { cn, type WithElementRef } from '$lib/utils.js';
  import type { HTMLThAttributes } from 'svelte/elements';

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLThAttributes> = $props();
</script>

<th
  bind:this={ref}
  data-slot="table-head"
  class={cn(
    // The overline treatment lives here rather than at each table: a
    // sentence-case column header is a drift, not a variant, and the mono label
    // layer is what makes a dense table read as Epitech.
    'h-10 bg-clip-padding px-2 text-start align-middle epi-overline whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pe-0',
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</th>
