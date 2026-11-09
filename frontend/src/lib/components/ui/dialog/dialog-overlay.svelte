<script lang="ts">
  import { Dialog as DialogPrimitive } from 'bits-ui';
  import { cn } from '$lib/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    instant = false,
    ...restProps
  }: DialogPrimitive.OverlayProps & {
    /**
     * Appear and leave at once, with the `instant` dialog it sits under. The
     * fade is left out rather than overridden: `data-[state=closed]:animate-none`
     * loses to `data-[state=closed]:animate-out`, which Tailwind emits after it.
     */
    instant?: boolean;
  } = $props();

  const MOTION =
    'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0';
</script>

<DialogPrimitive.Overlay
  bind:ref
  data-slot="dialog-overlay"
  class={cn('fixed inset-0 z-50 bg-black/50', !instant && MOTION, className)}
  {...restProps}
/>
