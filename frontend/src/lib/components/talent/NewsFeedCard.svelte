<script lang="ts">
  import { base } from '$app/paths';
  import { cn } from '$lib/utils';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Avatar from '$lib/components/ui/avatar';
  import NewsPostBody from '$lib/components/talent/NewsPostBody.svelte';
  import { getInitials } from '$lib/avatar';
  import Newspaper from '@lucide/svelte/icons/newspaper';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';

  type Post = {
    id: string;
    title: string;
    content: string;
    publishedAt: string;
    authorName: string;
    authorImage: string | null;
  };

  let {
    posts,
    highlight = false,
  }: {
    posts: Post[];
    highlight?: boolean;
  } = $props();

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  const MAX_VISIBLE = 3;

  let selectedPost = $state<Post | null>(null);
  let dialogOpen = $state(false);

  function openPost(post: Post) {
    selectedPost = post;
    dialogOpen = true;
  }
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
    {#each posts.slice(0, MAX_VISIBLE) as post (post.id)}
      <button
        type="button"
        class="w-full cursor-pointer p-5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
        onclick={() => openPost(post)}
      >
        <h3
          class="mb-1 line-clamp-2 text-sm font-bold text-slate-900 dark:text-white"
        >
          {post.title}
        </h3>

        <div class="relative max-h-[3.5em] overflow-hidden">
          <NewsPostBody content={post.content} class="prose-sm" />
          <div
            class="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent dark:from-slate-900"
          ></div>
        </div>

        <div class="mt-2 flex items-center gap-2">
          <Avatar.Root class="h-5 w-5 text-[9px]">
            {#if post.authorImage}
              <Avatar.Image src={post.authorImage} alt={post.authorName} />
            {/if}
            <Avatar.Fallback class="bg-primary/10 text-primary">
              {getInitials(post.authorName)}
            </Avatar.Fallback>
          </Avatar.Root>
          <span class="text-xs text-slate-500">{post.authorName}</span>
          <span class="text-xs text-slate-300 dark:text-slate-600">·</span>
          <time class="text-xs text-slate-400" datetime={post.publishedAt}>
            {dateFmt.format(new Date(post.publishedAt))}
          </time>
        </div>
      </button>
    {/each}
  </div>

  {#if posts.length > MAX_VISIBLE}
    <div class="border-t border-slate-100 px-6 py-3 dark:border-slate-800">
      <a
        href="{base}/actus"
        class="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-500 transition-all hover:bg-epi-blue/10 hover:text-epi-blue dark:bg-slate-800 dark:hover:bg-epi-blue/20"
      >
        Voir toutes les actualités
        <ArrowRight
          class="h-4 w-4 transition-transform group-hover:translate-x-0.5"
        />
      </a>
    </div>
  {/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
  <Dialog.Content class="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
    {#if selectedPost}
      <Dialog.Header>
        <Dialog.Title class="text-lg font-bold">
          {selectedPost.title}
        </Dialog.Title>
        <Dialog.Description>
          <div class="flex items-center gap-2">
            <Avatar.Root class="h-5 w-5 text-[9px]">
              {#if selectedPost.authorImage}
                <Avatar.Image
                  src={selectedPost.authorImage}
                  alt={selectedPost.authorName}
                />
              {/if}
              <Avatar.Fallback class="bg-primary/10 text-primary">
                {getInitials(selectedPost.authorName)}
              </Avatar.Fallback>
            </Avatar.Root>
            <span class="text-xs text-slate-500">
              {selectedPost.authorName}
            </span>
            <span class="text-xs text-slate-300 dark:text-slate-600">·</span>
            <time
              class="text-xs text-slate-400"
              datetime={selectedPost.publishedAt}
            >
              {dateFmt.format(new Date(selectedPost.publishedAt))}
            </time>
          </div>
        </Dialog.Description>
      </Dialog.Header>

      <div class="mt-4">
        <NewsPostBody content={selectedPost.content} />
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
