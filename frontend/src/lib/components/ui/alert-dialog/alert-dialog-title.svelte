<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
  import { cn } from '$lib/utils.js';

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: AlertDialogPrimitive.TitleProps = $props();
</script>

<!-- An AlertDialog always gates a consequential/destructive action, so its title
     gets the Anton display treatment by default (Dialog.Title, general content,
     stays plain). Don't re-add this class per call site: override only for a
     genuine exception (see QrDialog for one). -->
<AlertDialogPrimitive.Title
  bind:ref
  data-slot="alert-dialog-title"
  class={cn('font-heading text-xl tracking-wider uppercase', className)}
  {...restProps}
/>
