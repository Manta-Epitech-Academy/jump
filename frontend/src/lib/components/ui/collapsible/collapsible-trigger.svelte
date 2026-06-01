<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from 'bits-ui';
  import { cn } from '$lib/utils.js';

  let { class: className, ...restProps }: CollapsiblePrimitive.TriggerProps =
    $props();
</script>

<CollapsiblePrimitive.Trigger
  class={cn('cursor-pointer', className)}
  {...restProps}
/>
