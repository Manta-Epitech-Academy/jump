<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
  import CheckIcon from '@lucide/svelte/icons/check';
  import { cn, type WithoutChild } from '$lib/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    children: childrenProp,
    ...restProps
  }: WithoutChild<DropdownMenuPrimitive.RadioItemProps> = $props();
</script>

<DropdownMenuPrimitive.RadioItem
  bind:ref
  data-slot="dropdown-menu-radio-item"
  class={cn(
    "relative flex cursor-default items-center gap-2 rounded-sm py-1.5 ps-8 pe-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    className,
  )}
  {...restProps}
>
  <!-- A check, not shadcn's filled dot: "this option is the selected one" is
       said with a ✓ everywhere else here, from the sibling checkbox item right
       next to this file to `SearchableSelect`. A third glyph for the same idea
       is how a vocabulary drifts. Space is reserved rather than conditional, so
       the labels do not shift as the selection moves. -->
  {#snippet children({ checked })}
    <span
      class="pointer-events-none absolute start-2 flex size-3.5 items-center justify-center"
    >
      <CheckIcon class={cn('size-4', !checked && 'text-transparent')} />
    </span>
    {@render childrenProp?.({ checked })}
  {/snippet}
</DropdownMenuPrimitive.RadioItem>
