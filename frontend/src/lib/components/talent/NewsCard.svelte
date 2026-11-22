<script lang="ts">
  import * as ResponsiveDialog from '#lib/components/ui/responsive-dialog/index.ts';
  import CardAction from '#lib/components/talent/CardAction.svelte';
  import { Card } from '#lib/components/ui/card/index.ts';
  import { cn } from '#lib/utils.ts';
  import { hideBrokenPictures } from '#lib/actions/hideBrokenPictures.ts';

  // The campus's word to its talents (`write_talent_home_note`), already
  // rendered and sanitised server-side. The card frames it with « Actualité »,
  // the 2027 mockup's small label, and adds no label of its own: what the
  // message is about, and how it is titled, is the author's to say. A long one shows a clamped preview and
  // opens whole in a dialog.
  let { html }: { html: string } = $props();

  let open = $state(false);
  let bodyRef = $state<HTMLDivElement | null>(null);

  // Whether the preview is cut off by the clamp, so a short message does not
  // offer a button that would only open the same words again.
  let clipped = $state(false);
  function measure(node: HTMLElement) {
    const observer = new ResizeObserver(() => {
      clipped = node.scrollHeight > node.clientHeight;
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  // On open, pin the message to the top. The scroll container differs per
  // platform (the dialog panel on desktop, the body itself on mobile), so walk
  // up from the body once it mounts and zero every scrollable ancestor.
  $effect(() => {
    if (!open || !bodyRef) return;
    const body = bodyRef;
    requestAnimationFrame(() => {
      for (let el: HTMLElement | null = body; el; el = el.parentElement) {
        el.scrollTop = 0;
      }
    });
  });
</script>

<!-- The message itself, in the clamped preview and whole in the dialog, so the
     two cannot be typeset differently. Its pictures are drawn whole, centred,
     never past their own pixels, and bounded in height (smaller in the
     preview, where the text has to stay readable around them); a rectangle
     with no radius (DESIGN.md: images). One that cannot be shown is hidden
     rather than left as a broken glyph. -->
{#snippet message(className?: string)}
  <div
    class={cn(
      'prose max-w-none prose-slate dark:prose-invert prose-img:mx-auto prose-img:my-4 prose-img:block prose-img:h-auto prose-img:w-auto prose-img:max-w-full',
      className,
    )}
    use:hideBrokenPictures={html}
  >
    {@html html}
  </div>
{/snippet}

<Card role="region" aria-labelledby="news-card-title" class="gap-3 p-6">
  <h2 id="news-card-title" class="epi-overline text-muted-foreground">
    Actualité
  </h2>

  <!-- Clamped preview: fades out when cut, full content in the dialog. -->
  <div class="relative max-h-[20rem] overflow-hidden" use:measure>
    {@render message('prose-sm prose-img:max-h-64')}
    {#if clipped}
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent"
      ></div>
    {/if}
  </div>

  {#if clipped}
    <CardAction onclick={() => (open = true)}>Lire la suite</CardAction>
  {/if}
</Card>

<ResponsiveDialog.Root bind:open>
  <ResponsiveDialog.Content class="sm:max-w-2xl">
    <ResponsiveDialog.Header>
      <ResponsiveDialog.Title>Actualité</ResponsiveDialog.Title>
    </ResponsiveDialog.Header>
    <ResponsiveDialog.Body bind:ref={bodyRef}>
      {@render message('prose-img:max-h-[60svh]')}
    </ResponsiveDialog.Body>
  </ResponsiveDialog.Content>
</ResponsiveDialog.Root>
