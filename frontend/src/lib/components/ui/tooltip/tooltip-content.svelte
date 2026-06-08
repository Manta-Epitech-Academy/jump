<script lang="ts">
  import { Tooltip as TooltipPrimitive } from 'bits-ui';
  import { cn } from '$lib/utils.js';
  import TooltipPortal from './tooltip-portal.svelte';
  import type { ComponentProps } from 'svelte';
  import type { WithoutChildrenOrChild } from '$lib/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    sideOffset = 0,
    side = 'top',
    children,
    arrowClasses,
    showArrow = true,
    portalProps,
    ...restProps
  }: TooltipPrimitive.ContentProps & {
    arrowClasses?: string;
    /**
     * Drop the pointer arrow. The arrow always points back at the trigger, so
     * it reads badly when the trigger sits on a different surface than the
     * tooltip (e.g. a right-side tooltip whose dark arrow lands on the dark
     * sidebar). In those cases hide it and lean on `sideOffset` for the link.
     */
    showArrow?: boolean;
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof TooltipPortal>>;
  } = $props();
</script>

<TooltipPortal {...portalProps}>
  <TooltipPrimitive.Content
    bind:ref
    data-slot="tooltip-content"
    {sideOffset}
    {side}
    class={cn(
      'z-50 w-fit origin-(--bits-tooltip-content-transform-origin) animate-in rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-end-2 data-[side=right]:slide-in-from-start-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
      className,
    )}
    {...restProps}
  >
    {@render children?.()}
    {#if showArrow}
      <TooltipPrimitive.Arrow>
        {#snippet child({ props })}
          <div
            class={cn(
              'z-50 size-2.5 rotate-45 rounded-[2px] bg-foreground',
              'data-[side=top]:translate-x-1/2 data-[side=top]:translate-y-[calc(-50%_+_2px)]',
              'data-[side=bottom]:-translate-x-1/2 data-[side=bottom]:-translate-y-[calc(-50%_+_1px)]',
              'data-[side=right]:translate-x-[calc(50%_+_2px)] data-[side=right]:translate-y-1/2',
              'data-[side=left]:-translate-y-[calc(50%_-_3px)]',
              arrowClasses,
            )}
            {...props}
          ></div>
        {/snippet}
      </TooltipPrimitive.Arrow>
    {/if}
  </TooltipPrimitive.Content>
</TooltipPortal>
