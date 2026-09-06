<script lang="ts">
  import type { Snippet } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog';

  // A QR code projected on a TV for a room full of talents: the bilan form's
  // link and the émargement check-in both do this, and both had written the
  // full-screen shell out for themselves.
  //
  // It fills the viewport with an opaque background rather than sitting as a
  // modal over the page, because what is behind it is a dev-space screen
  // carrying a cohort's names. The image is always server-rendered, so the
  // signed link never reaches the page JS.
  let {
    open = $bindable(false),
    title,
    description,
    qrSrc,
    qrAlt,
    sizeClass = 'h-[60vmin] w-[60vmin]',
    footer,
  }: {
    open: boolean;
    title: string;
    description: string;
    qrSrc: string;
    qrAlt: string;
    /**
     * Size utilities for the code itself. Viewport-relative (`vmin`) so it fills
     * whatever it is cast on, whichever way round the screen is.
     */
    sizeClass?: string;
    /** Optional block under the code: a copyable link, a PDF to print. */
    footer?: Snippet;
  } = $props();
</script>

<Dialog.Root bind:open>
  <!-- Don't pull focus into the content on open: this is a projected code, and
       nothing in here is for the person holding the keyboard. Focus stays on the
       trigger, and the dialog still traps Tab and closes on Escape. -->
  <Dialog.Content
    onOpenAutoFocus={(e) => e.preventDefault()}
    class="top-0 left-0 flex h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-8 rounded-none border-0 bg-background p-8 sm:max-w-none"
  >
    <Dialog.Header class="items-center gap-1 text-center sm:text-center">
      <!-- Projected display, not modal chrome: styled like a page heading
           (PageHeader et al.), not the plain Dialog.Title default. -->
      <Dialog.Title class="font-heading text-display-m">
        {title}
      </Dialog.Title>
      <Dialog.Description class="text-base">
        {description}
      </Dialog.Description>
    </Dialog.Header>

    <div class="rounded-xl border bg-card p-6 shadow-raised">
      <img
        src={qrSrc}
        alt={qrAlt}
        class="{sizeClass} [image-rendering:pixelated]"
      />
    </div>

    {#if footer}
      {@render footer()}
    {/if}
  </Dialog.Content>
</Dialog.Root>
