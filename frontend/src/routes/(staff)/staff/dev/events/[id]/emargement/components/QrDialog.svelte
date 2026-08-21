<script lang="ts">
  import Download from '@lucide/svelte/icons/download';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import {
    slotLabelFr,
    dayLabelFr,
    type PresenceSlot,
    type DateKey,
  } from '$lib/domain/eventPresence';

  // Shows the QR for the currently selected créneau (day + half-day) as a
  // full-screen presentation: the staff projects it on a TV, so it fills the
  // viewport with an opaque background that hides the dev space behind (which
  // can carry sensitive info). One stable code, valid until the créneau is
  // closed; the image is server-rendered so the signed link never reaches the
  // page JS.
  let {
    open = $bindable(false),
    basePath,
    day,
    slot,
  }: {
    open: boolean;
    /** Page pathname; the QR image + PDF hang off it. */
    basePath: string;
    day: DateKey;
    slot: PresenceSlot;
  } = $props();

  const qrSrc = $derived(`${basePath}/qr.png?day=${day}&slot=${slot}`);
  const pdfHref = $derived(`${basePath}/qr.pdf?day=${day}&slot=${slot}`);
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="top-0 left-0 flex h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-8 rounded-none border-0 bg-background p-8 sm:max-w-none"
  >
    <Dialog.Header class="items-center gap-1 text-center sm:text-center">
      <!-- Full-screen projected display, not modal chrome: styled like a page
           heading (PageHeader et al.), not the plain Dialog.Title default. -->
      <Dialog.Title class="font-heading text-display-m">
        Émargement
      </Dialog.Title>
      <Dialog.Description class="text-base">
        {dayLabelFr(day)} · {slotLabelFr(slot)}. Scanne ce QR code pour
        t'enregistrer.
      </Dialog.Description>
    </Dialog.Header>

    <div class="rounded-xl border bg-card p-6 shadow-raised">
      <img
        src={qrSrc}
        alt={`QR code d'émargement - ${slotLabelFr(slot)}`}
        class="h-[68vmin] w-[68vmin] [image-rendering:pixelated]"
      />
    </div>

    <Button variant="outline" href={pdfHref} target="_blank">
      <Download class="mr-2 h-4 w-4" />
      Télécharger le PDF
    </Button>
  </Dialog.Content>
</Dialog.Root>
