<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Drawer from '$lib/components/ui/drawer';
  import { MediaQuery } from 'svelte/reactivity';
  import type { Snippet } from 'svelte';
  import { setResponsiveDialogContext } from './context.js';

  let {
    open = $bindable(false),
    children,
  }: {
    open?: boolean;
    children: Snippet;
  } = $props();

  // 768px is the shadcn / Tailwind `md` breakpoint and the same threshold the
  // Credenza pattern uses to flip between dialog and drawer.
  const isDesktop = new MediaQuery('(min-width: 768px)');

  setResponsiveDialogContext({
    get isDesktop() {
      return isDesktop.current;
    },
  });
</script>

{#if isDesktop.current}
  <Dialog.Root bind:open>
    {@render children()}
  </Dialog.Root>
{:else}
  <Drawer.Root bind:open>
    {@render children()}
  </Drawer.Root>
{/if}
