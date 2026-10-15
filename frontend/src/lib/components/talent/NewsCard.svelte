<script lang="ts">
  import * as ResponsiveDialog from '$lib/components/ui/responsive-dialog';
  import { Button } from '$lib/components/ui/button';
  import Newspaper from '@lucide/svelte/icons/newspaper';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import { cn } from '$lib/utils';
  import { hideBrokenPictures } from '$lib/actions/hideBrokenPictures';

  // The campus's word to its talents (`write_talent_home_note`), already
  // rendered and sanitised server-side. The page frames it with « Actualités »
  // and adds no label of its own: what the message is about, and how it is
  // titled, is the author's to say. A long one shows a clamped preview and
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

<section
  aria-labelledby="news-card-title"
  class="overflow-hidden rounded-xl border border-border bg-card shadow-raised"
>
  <div
    class="flex items-center gap-2 border-b border-border bg-background/50 px-6 py-4"
  >
    <Newspaper class="h-4 w-4 shrink-0 text-epi-blue" />
    <h2
      id="news-card-title"
      class="font-heading text-display-s text-foreground"
    >
      Actualités<TitleCursor />
    </h2>
  </div>

  <div class="p-6">
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
      <Button
        variant="outline"
        onclick={() => (open = true)}
        class="mt-4 w-full cursor-pointer gap-2 rounded-xl border-border transition-colors hover:border-epi-blue hover:bg-epi-blue hover:text-white dark:hover:border-epi-blue dark:hover:bg-epi-blue dark:hover:text-white"
      >
        Lire la suite <ArrowRight class="h-4 w-4" />
      </Button>
    {/if}
  </div>
</section>

<ResponsiveDialog.Root bind:open>
  <ResponsiveDialog.Content class="sm:max-w-2xl">
    <ResponsiveDialog.Header>
      <ResponsiveDialog.Title class="flex items-center gap-2">
        <Newspaper class="h-5 w-5 text-epi-blue" />
        Actualités
      </ResponsiveDialog.Title>
    </ResponsiveDialog.Header>
    <ResponsiveDialog.Body bind:ref={bodyRef}>
      {@render message('prose-img:max-h-[60svh]')}
    </ResponsiveDialog.Body>
  </ResponsiveDialog.Content>
</ResponsiveDialog.Root>
