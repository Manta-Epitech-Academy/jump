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

<!-- `rounded-xl` and `shadow-card` both resolve through a per-space token
     (`--radius-surface`, `--elevation-card`; see the space-skins block in
     `routes/layout.css`), so one card is square and flat in the staff spaces and
     soft and raised in the talent and parent ones with no prop and no branching
     here. Do not put a literal radius or a fixed shadow back on this element.

     A new card uses this component. The talent and parent spaces still hold
     hand-rolled equivalents (`rounded-xl border bg-card shadow-raised`), which
     render the same surface now that all four values come from tokens; they are
     not a second definition to copy from. -->
<div
  bind:this={ref}
  data-slot="card"
  class={cn(
    'flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-card',
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</div>
