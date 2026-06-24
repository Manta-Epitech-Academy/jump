<script lang="ts">
  import { base } from '$app/paths';
  import { cn } from '$lib/utils';
  import NewsPostBody from '$lib/components/talent/NewsPostBody.svelte';
  import Newspaper from '@lucide/svelte/icons/newspaper';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';

  // The talent dashboard's news feed card. Shows the latest published news post
  // with a clamped preview and a link to the full /actus page. `highlight` flags
  // it fresh (ring + "Nouveau") on first arrival from onboarding.
  let {
    news,
    highlight = false,
  }: {
    news: {
      id: string;
      title: string;
      content: string;
      publishedAt: string;
    } | null;
    highlight?: boolean;
  } = $props();
</script>

<div
  class={cn(
    'overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 transition-shadow dark:bg-slate-900 dark:shadow-none',
    highlight &&
      'ring-2 ring-epi-teal/70 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-950',
  )}
>
  <div
    class="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900"
  >
    <Newspaper class="h-4 w-4 shrink-0 text-epi-blue" />
    <h2
      class="font-heading text-base tracking-wider text-slate-800 uppercase dark:text-slate-200"
    >
      Actualités<span class="text-epi-teal">_</span>
    </h2>
    {#if highlight}
      <span
        class="ml-auto rounded-full bg-epi-teal px-2 py-0.5 text-[10px] font-bold text-black"
      >
        Nouveau
      </span>
    {/if}
  </div>

  <div
    class="max-h-[40rem] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800"
  >
    {#if news}
      <article class="p-6">
        <h3 class="mb-2 text-sm font-bold text-slate-900 dark:text-white">
          {news.title}
        </h3>

        <!-- Clamped preview: fades out, full content on /actus. -->
        <div class="relative max-h-[20rem] overflow-hidden">
          <NewsPostBody content={news.content} class="prose-sm" />
          <div
            class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent dark:from-slate-900"
          ></div>
        </div>

        <div class="mt-4 flex justify-center">
          <a
            href="{base}/actus"
            class="group inline-flex items-center gap-2 rounded-full bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-500 transition-all hover:bg-epi-blue/10 hover:text-epi-blue dark:bg-slate-800 dark:hover:bg-epi-blue/20"
          >
            Voir tout
            <ArrowRight
              class="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            />
          </a>
        </div>
      </article>
    {/if}
  </div>
</div>
