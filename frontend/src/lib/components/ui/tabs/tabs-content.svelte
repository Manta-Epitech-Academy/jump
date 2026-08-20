<script lang="ts">
  import { Tabs as TabsPrimitive } from 'bits-ui';
  import { cn } from '$lib/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: TabsPrimitive.ContentProps = $props();
</script>

<!-- design-lint-ignore: the panel takes focus when its tab is activated, and
     the selected tab already shows where focus went. -->
<TabsPrimitive.Content
  bind:ref
  data-slot="tabs-content"
  class={cn('flex-1 outline-none', className)}
  {...restProps}
/>
