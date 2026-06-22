<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';

  // Full-screen QR of the bilan form's authenticated link, projected to the
  // cohort. The image is server-rendered so the link is built from ORIGIN, not
  // the page JS. One stable code for the whole event.
  let {
    open = $bindable(false),
    basePath,
    title,
  }: {
    open: boolean;
    /** Page pathname; the QR image hangs off it. */
    basePath: string;
    title: string;
  } = $props();

  const qrSrc = $derived(`${basePath}/qr.png`);
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="top-0 left-0 flex h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-8 rounded-none border-0 bg-background p-8 sm:max-w-none"
  >
    <Dialog.Header class="items-center gap-1 text-center sm:text-center">
      <Dialog.Title class="font-heading text-2xl tracking-wide uppercase">
        {title}
      </Dialog.Title>
      <Dialog.Description class="text-base">
        Scanne ce QR code pour donner ton avis sur le stage. Ça prend 5 minutes.
      </Dialog.Description>
    </Dialog.Header>

    <div class="rounded-2xl border bg-white p-6 shadow-sm">
      <img
        src={qrSrc}
        alt="QR code du bilan de stage"
        class="h-[68vmin] w-[68vmin] [image-rendering:pixelated]"
      />
    </div>
  </Dialog.Content>
</Dialog.Root>
