<script lang="ts">
  import * as ResponsiveDialog from '$lib/components/ui/responsive-dialog';
  import { Button } from '$lib/components/ui/button';
  import { cn } from '$lib/utils';
  import WelcomeMessageBody from '$lib/components/talent/WelcomeMessageBody.svelte';
  import Newspaper from '@lucide/svelte/icons/newspaper';
  import Mail from '@lucide/svelte/icons/mail';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';

  // Seed of the talent's "fil d'actualité". Today the only item is the stage
  // welcome message; future items (announcements, badges earned, etc.) stack
  // into the same list. The list region is height-bounded + scrollable so the
  // feed grows without pushing page height.
  //
  // This card is the welcome message's permanent home. `highlight` flags it
  // fresh (ring + "Nouveau") on first arrival from onboarding.
  let {
    welcomeContent,
    highlight = false,
  }: {
    welcomeContent: string | null;
    highlight?: boolean;
  } = $props();

  let open = $state(false);
  let bodyRef = $state<HTMLDivElement | null>(null);

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
    'overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 transition-shadow dark:bg-slate-900 dark:shadow-none',
    highlight &&
      'ring-2 ring-epi-tech/70 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-950',
  )}
>
  <div
    class="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900"
  >
    <Newspaper class="h-4 w-4 shrink-0 text-epi-blue" />
    <h2 class="font-heading text-display-s text-slate-800 dark:text-slate-200">
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

  <div
    class="max-h-[40rem] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800"
  >
    {#if welcomeContent}
      <article class="p-6">
        <div class="mb-2 flex items-center gap-1.5 epi-overline text-slate-400">
          <Mail class="h-3.5 w-3.5" />
          Message de bienvenue
        </div>

        <!-- Clamped preview: fades out, full content in the dialog. -->
        <div class="relative max-h-[20rem] overflow-hidden">
          <WelcomeMessageBody content={welcomeContent} class="prose-sm" />
          <div
            class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent dark:from-slate-900"
          ></div>
        </div>

        <Button
          variant="outline"
          onclick={() => (open = true)}
          class="mt-4 w-full gap-2 rounded-xl border-slate-200 transition-colors hover:border-epi-blue hover:bg-epi-blue hover:text-white dark:border-slate-800 dark:hover:border-epi-blue dark:hover:bg-epi-blue dark:hover:text-white"
        >
          Lire le message <ArrowRight class="h-4 w-4" />
        </Button>
      </article>
    {/if}
  </div>
</div>

{#if welcomeContent}
  <ResponsiveDialog.Root bind:open>
    <ResponsiveDialog.Content class="sm:max-w-2xl">
      <ResponsiveDialog.Header>
        <ResponsiveDialog.Title class="flex items-center gap-2">
          <Mail class="h-5 w-5 text-epi-blue" />
          Message de bienvenue
        </ResponsiveDialog.Title>
      </ResponsiveDialog.Header>
      <ResponsiveDialog.Body bind:ref={bodyRef}>
        <WelcomeMessageBody content={welcomeContent} />
      </ResponsiveDialog.Body>
    </ResponsiveDialog.Content>
  </ResponsiveDialog.Root>
{/if}
