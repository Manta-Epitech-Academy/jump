<script lang="ts" module>
  /**
   * One entry of the feed, already rendered and sanitised server-side.
   *
   * `campus` is « le mot du campus », always there once the campus wrote one.
   * `welcome` is an event's welcome message, there while that event runs.
   */
  export type NewsFeedItem = { kind: 'campus' | 'welcome'; html: string };
</script>

<script lang="ts">
  import * as ResponsiveDialog from '$lib/components/ui/responsive-dialog';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import WelcomeMessageBody from '$lib/components/talent/WelcomeMessageBody.svelte';
  import Newspaper from '@lucide/svelte/icons/newspaper';
  import Mail from '@lucide/svelte/icons/mail';
  import Megaphone from '@lucide/svelte/icons/megaphone';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';

  // The talent's "fil d'actualité": the campus's note, then an event's welcome
  // message while one runs. Each item shows a clamped preview, and a long one
  // opens whole in a dialog. The list region is height-bounded + scrollable so
  // the feed grows without pushing page height.
  //
  // `highlight` flags the welcome message fresh (ring + "Nouveau") on first
  // arrival from onboarding.
  let {
    items,
    highlight = false,
  }: {
    items: NewsFeedItem[];
    highlight?: boolean;
  } = $props();

  const LABELS = {
    campus: { title: 'Le mot du campus', icon: Megaphone },
    welcome: { title: 'Message de bienvenue', icon: Mail },
  } as const;

  // `openKind` outlives the dialog's closing, so its content stays put while
  // it animates out.
  let open = $state(false);
  let openKind = $state<NewsFeedItem['kind'] | null>(null);
  const openItem = $derived(items.find((item) => item.kind === openKind));
  let bodyRef = $state<HTMLDivElement | null>(null);

  // Which previews are cut off by the clamp, so a short note does not offer a
  // button that would only open the same words again.
  let clipped = $state<Partial<Record<NewsFeedItem['kind'], boolean>>>({});
  function measure(node: HTMLElement, kind: NewsFeedItem['kind']) {
    const observer = new ResizeObserver(() => {
      clipped = { ...clipped, [kind]: node.scrollHeight > node.clientHeight };
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

<div
  class={cn(
    'overflow-hidden rounded-xl border border-border bg-card shadow-raised transition-shadow',
    highlight &&
      'ring-2 ring-epi-tech/70 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-950',
  )}
>
  <div
    class="flex items-center gap-2 border-b border-border bg-background/50 px-6 py-4"
  >
    <Newspaper class="h-4 w-4 shrink-0 text-epi-blue" />
    <h2 class="font-heading text-display-s text-foreground">
      Actualités<TitleCursor />
    </h2>
    {#if highlight}
      <span
        class="ml-auto rounded-full bg-epi-tech px-2 py-0.5 text-xs font-bold text-black"
      >
        Nouveau
      </span>
    {/if}
  </div>

  <div class="max-h-[40rem] divide-y divide-border overflow-y-auto">
    {#each items as item (item.kind)}
      {@const label = LABELS[item.kind]}
      <article class="p-6">
        <div
          class="mb-2 flex items-center gap-1.5 epi-overline text-muted-foreground"
        >
          <label.icon class="h-3.5 w-3.5" />
          {label.title}
        </div>

        <!-- Clamped preview: fades out when cut, full content in the dialog. -->
        <div
          class="relative max-h-[20rem] overflow-hidden"
          use:measure={item.kind}
        >
          <WelcomeMessageBody content={item.html} class="prose-sm" />
          {#if clipped[item.kind]}
            <div
              class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent"
            ></div>
          {/if}
        </div>

        {#if clipped[item.kind]}
          <Button
            variant="outline"
            onclick={() => {
              openKind = item.kind;
              open = true;
            }}
            class="mt-4 w-full gap-2 rounded-xl border-border transition-colors hover:border-epi-blue hover:bg-epi-blue hover:text-white dark:hover:border-epi-blue dark:hover:bg-epi-blue dark:hover:text-white"
          >
            Lire la suite <ArrowRight class="h-4 w-4" />
          </Button>
        {/if}
      </article>
    {/each}
  </div>
</div>

{#if openItem}
  {@const label = LABELS[openItem.kind]}
  <ResponsiveDialog.Root bind:open>
    <ResponsiveDialog.Content class="sm:max-w-2xl">
      <ResponsiveDialog.Header>
        <ResponsiveDialog.Title class="flex items-center gap-2">
          <label.icon class="h-5 w-5 text-epi-blue" />
          {label.title}
        </ResponsiveDialog.Title>
      </ResponsiveDialog.Header>
      <ResponsiveDialog.Body bind:ref={bodyRef}>
        <WelcomeMessageBody content={openItem.html} />
      </ResponsiveDialog.Body>
    </ResponsiveDialog.Content>
  </ResponsiveDialog.Root>
{/if}
