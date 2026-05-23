<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Drawer from '$lib/components/ui/drawer';
  import type { Snippet } from 'svelte';
  import { useResponsiveDialog } from './context.js';

  let {
    class: className,
    children,
    ...restProps
  }: {
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  } = $props();

  const ctx = useResponsiveDialog();
</script>

{#if ctx.isDesktop}
  <Dialog.Close class={className} {...restProps}>
    {@render children?.()}
  </Dialog.Close>
{:else}
  <Drawer.Close class={className} {...restProps}>
    {@render children?.()}
  </Drawer.Close>
{/if}
