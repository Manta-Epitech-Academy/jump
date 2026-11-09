<script lang="ts">
  import type { Snippet } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import Menu from '@lucide/svelte/icons/menu';
  import * as Drawer from '$lib/components/ui/drawer';
  import { buttonVariants } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';

  /**
   * The staff sidebar on a phone: a drawer from the left holding whatever the
   * layout renders in its desktop aside.
   *
   * Both staff layouts used to build this by hand, an `{#if}` around a backdrop
   * div and a flying aside. Neither kept keyboard focus inside, the admin one
   * ignored Escape, and the button read "Toggle menu" to a screen reader. The
   * drawer is a dialog, so focus, Escape, scroll lock and the trigger's
   * expanded state come with it, and a swipe to the left closes it like any
   * drawer on a phone.
   */
  let {
    triggerClass,
    skin,
    children,
  }: {
    /** Colours of the menu button, which sits on the layout's own header. */
    triggerClass?: string;
    /**
     * The layout's space skin (`admin-space`). The drawer portals to <body>,
     * out of the layout root that carries the skin, so it has to wear the
     * class itself or its accent falls back to the default blue
     * (`routes/layout.css`, Space skins).
     */
    skin?: string;
    children: Snippet;
  } = $props();

  let open = $state(false);

  // A link inside the drawer navigates; the drawer has done its job.
  afterNavigate(() => {
    open = false;
  });
</script>

<Drawer.Root bind:open direction="left" shouldScaleBackground={false}>
  <Drawer.Trigger
    class={cn(
      buttonVariants({ variant: 'ghost', size: 'icon' }),
      'h-10 w-10 shrink-0 [&_svg:not([class*=size-])]:size-6',
      triggerClass,
    )}
    aria-label="Ouvrir le menu"
  >
    <Menu aria-hidden="true" />
  </Drawer.Trigger>
  <Drawer.Content
    class={cn(
      'on-dark border-chrome-border bg-chrome text-chrome-foreground shadow-overlay data-[vaul-drawer-direction=left]:rounded-r-none',
      skin,
    )}
  >
    <Drawer.Title class="sr-only">Menu de navigation</Drawer.Title>
    {@render children()}
  </Drawer.Content>
</Drawer.Root>
