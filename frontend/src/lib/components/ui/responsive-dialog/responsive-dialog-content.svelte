<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Drawer from '$lib/components/ui/drawer';
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils.js';
  import { useResponsiveDialog } from './context.js';

  let {
    class: className,
    showCloseButton = true,
    children,
    ...restProps
  }: {
    class?: string;
    /** Desktop only — the drawer uses a drag handle instead. */
    showCloseButton?: boolean;
    children: Snippet;
    [key: string]: unknown;
  } = $props();

  const ctx = useResponsiveDialog();
</script>

{#if ctx.isDesktop}
  <!-- Overflow on the grid container itself scrolls the whole panel; capped so
       tall content never exceeds the viewport. The drawer caps its own height
       and scrolls via `Body`, so this stays desktop-only. -->
  <Dialog.Content
    class={cn('max-h-[85vh] overflow-y-auto', className)}
    {showCloseButton}
    {...restProps}
  >
    {@render children()}
  </Dialog.Content>
{:else}
  <Drawer.Content class={className} {...restProps}>
    {@render children()}
  </Drawer.Content>
{/if}
