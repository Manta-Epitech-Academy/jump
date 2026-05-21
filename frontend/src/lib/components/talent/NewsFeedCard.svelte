<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import Newspaper from '@lucide/svelte/icons/newspaper';
  import Mail from '@lucide/svelte/icons/mail';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';

  // Seed of the talent's "fil d'actualité". Today the only item is the stage
  // welcome message; future items (announcements, badges earned, etc.) stack
  // into the same list. The list region is height-bounded + scrollable so the
  // feed grows without pushing page height.
  let { welcomeContent }: { welcomeContent: string | null } = $props();

  let welcomeOpen = $state(false);
</script>

<div
  class="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
>
  <div
    class="flex items-center gap-2 border-b border-slate-100 bg-blue-50/50 px-6 py-4 text-xs font-bold text-epi-blue uppercase dark:border-slate-800 dark:bg-blue-950/20"
  >
    <Newspaper class="h-4 w-4" />
    Actualités
  </div>

  <div
    class="max-h-[36rem] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800"
  >
    {#if welcomeContent}
      <article class="p-6">
        <div
          class="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase"
        >
          <Mail class="h-3.5 w-3.5" />
          Message de bienvenue
        </div>

        <!-- Clamped preview: fades out, full content in the dialog. -->
        <div class="relative max-h-[16rem] overflow-hidden">
          <div class="prose prose-sm max-w-none prose-slate dark:prose-invert">
            {@html welcomeContent}
          </div>
          <div
            class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent dark:from-slate-900"
          ></div>
        </div>

        <Button
          variant="outline"
          onclick={() => (welcomeOpen = true)}
          class="mt-4 w-full gap-2 rounded-xl border-slate-200 transition-colors hover:border-epi-blue hover:bg-epi-blue hover:text-white dark:border-slate-800 dark:hover:border-epi-blue dark:hover:bg-epi-blue dark:hover:text-white"
        >
          Lire le message <ArrowRight class="h-4 w-4" />
        </Button>
      </article>
    {/if}
  </div>
</div>

{#if welcomeContent}
  <Dialog.Root bind:open={welcomeOpen}>
    <Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      <Dialog.Header>
        <Dialog.Title class="flex items-center gap-2">
          <Mail class="h-5 w-5 text-epi-blue" />
          Message de bienvenue
        </Dialog.Title>
      </Dialog.Header>
      <div class="prose max-w-none prose-slate dark:prose-invert">
        {@html welcomeContent}
      </div>
    </Dialog.Content>
  </Dialog.Root>
{/if}
