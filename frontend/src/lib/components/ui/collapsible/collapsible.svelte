<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from 'bits-ui';

  let { ...restProps }: CollapsiblePrimitive.RootProps = $props();
</script>

<CollapsiblePrimitive.Root {...restProps} />
