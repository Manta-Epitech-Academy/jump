<script lang="ts">
  import { Dialog as DialogPrimitive } from 'bits-ui';
  import DialogPortal from './dialog-portal.svelte';
  import XIcon from '@lucide/svelte/icons/x';
  import type { Snippet } from 'svelte';
  import * as Dialog from './index.js';
  import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';
  import type { ComponentProps } from 'svelte';

  let {
    ref = $bindable(null),
    class: className,
    portalProps,
    children,
    showCloseButton = true,
    onOpenAutoFocus,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
    children: Snippet;
    showCloseButton?: boolean;
  } = $props();

  /**
   * A dialog opens on the first thing you can act on.
   *
   * bits-ui focuses the first tabbable descendant, and a hint affordance
   * (`[data-hint]`, the ⓘ of `InfoTooltip`) is tabbable on purpose so a keyboard
   * user can reach it. When one sits next to the first field's label it comes
   * first in the DOM, wins that focus and pops its tooltip open on its own, on
   * every open. Skipping hints belongs here rather than in each dialog: the rule
   * is about where a dialog starts, not about one screen's copy.
   */
  const FOCUSABLE =
    'input:not([type="hidden"]), select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])';

  const focusFirstControl = (e: Event) => {
    onOpenAutoFocus?.(e);
    if (e.defaultPrevented || !ref) return;
    const control = Array.from(
      ref.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).find((el) => !el.closest('[data-hint]') && !el.hasAttribute('disabled'));
    // Nothing to act on: leave bits-ui to focus the box itself.
    if (!control) return;
    e.preventDefault();
    requestAnimationFrame(() => control.focus());
  };
</script>

<DialogPortal {...portalProps}>
  <Dialog.Overlay />
  <DialogPrimitive.Content
    bind:ref
    data-slot="dialog-content"
    class={cn(
      'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-overlay duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg',
      className,
    )}
    onOpenAutoFocus={focusFirstControl}
    {...restProps}
  >
    {@render children?.()}
    {#if showCloseButton}
      <DialogPrimitive.Close
        class="absolute end-4 top-4 cursor-pointer rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
      >
        <XIcon />
        <span class="sr-only">Close</span>
      </DialogPrimitive.Close>
    {/if}
  </DialogPrimitive.Content>
</DialogPortal>
