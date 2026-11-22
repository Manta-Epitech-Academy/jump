<script lang="ts">
  import * as Dialog from '#lib/components/ui/dialog/index.ts';
  import * as Drawer from '#lib/components/ui/drawer/index.ts';
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
  <Dialog.Trigger class={className} {...restProps}>
    {@render children?.()}
  </Dialog.Trigger>
{:else}
  <Drawer.Trigger class={className} {...restProps}>
    {@render children?.()}
  </Drawer.Trigger>
{/if}
