<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';

  // Full-screen QR of the event form's authenticated link, projected to the
  // cohort. The image is server-rendered so the link is built from ORIGIN, not
  // the page JS. One stable code for the whole event.
  let {
    open = $bindable(false),
    basePath,
    title,
    url,
  }: {
    open: boolean;
    /** Page pathname; the QR image hangs off it. */
    basePath: string;
    title: string;
    /** Same link the QR encodes, shown as text so staff can copy/share it (e.g. on Discord). */
    url: string | null;
  } = $props();

  const qrSrc = $derived(`${basePath}/qr.png`);
</script>

<Dialog.Root bind:open>
  <!-- Don't auto-focus into the content on open: this is a projected QR, nothing
       here needs focus. Focus stays on the trigger and the dialog still traps
       Tab + closes on Escape. -->
  <Dialog.Content
    onOpenAutoFocus={(e) => e.preventDefault()}
    class="top-0 left-0 flex h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-8 rounded-none border-0 bg-background p-8 sm:max-w-none"
  >
    <Dialog.Header class="items-center gap-1 text-center sm:text-center">
      <!-- Full-screen projected display, not modal chrome: styled like a page
           heading (AdminPageHeader et al.), not the plain Dialog.Title default. -->
      <Dialog.Title class="font-heading text-2xl tracking-wider uppercase">
        {title}
      </Dialog.Title>
      <Dialog.Description class="text-base">
        Scanne ce QR code pour donner ton avis. Ça prend 5 minutes.
      </Dialog.Description>
    </Dialog.Header>

    <div class="rounded-2xl border bg-white p-6 shadow-sm">
      <img
        src={qrSrc}
        alt="QR code du formulaire de feedback"
        class="h-[60vmin] w-[60vmin] [image-rendering:pixelated]"
      />
    </div>

    <!-- The same link as the QR, in clear: some won't scan (they'll type it, or
         staff copy it to share on Discord). Built from ORIGIN server-side so it
         matches the code byte-for-byte. -->
    {#if url}
      <div class="flex max-w-[90vw] flex-col items-center gap-2">
        <p class="text-sm text-muted-foreground">
          Pas de quoi scanner ? Ouvre ce lien dans ton navigateur :
        </p>
        <div
          class="flex max-w-full items-center gap-2 rounded-sm border bg-muted/40 px-3 py-2"
        >
          <code class="min-w-0 truncate font-mono text-sm">{url}</code>
          <CopyButton value={url} label="Copier le lien" class="shrink-0" />
        </div>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
