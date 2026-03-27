<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn, type WithElementRef } from '$lib/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
  bind:this={ref}
  data-slot="card"
  class={cn(
    'flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm',
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</div>
