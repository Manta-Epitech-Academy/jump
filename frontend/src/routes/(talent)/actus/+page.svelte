<script lang="ts">
  import type { PageData } from './$types';
  import { fly } from 'svelte/transition';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Avatar from '$lib/components/ui/avatar';
  import NewsPostBody from '$lib/components/talent/NewsPostBody.svelte';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import { getInitials } from '$lib/avatar';
  import Newspaper from '@lucide/svelte/icons/newspaper';
  import Inbox from '@lucide/svelte/icons/inbox';

  let { data }: { data: PageData } = $props();

  const dateFmt = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  let selectedPost = $state<(typeof data.posts)[number] | null>(null);
  let dialogOpen = $state(false);

  function openPost(post: (typeof data.posts)[number]) {
    selectedPost = post;
    dialogOpen = true;
  }
</script>

<svelte:head>
  <title>Actualités</title>
</svelte:head>

<TalentPageHeader title="Actualités" icon={Newspaper} />

<div class="mx-auto max-w-5xl px-4 py-8 sm:py-12">
  {#if data.posts.length > 0}
    <div
      class="flex flex-col gap-4"
      in:fly={{ y: 20, duration: 400, delay: 200 }}
    >
      {#each data.posts as post (post.id)}
        <button
          type="button"
          class="w-full cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          onclick={() => openPost(post)}
        >
          <h3
            class="mb-2 line-clamp-2 text-sm font-bold text-slate-900 dark:text-white"
          >
            {post.title}
          </h3>

          <div class="relative max-h-[4.5em] overflow-hidden">
            <NewsPostBody content={post.content} class="prose-sm" />
            <div
              class="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent dark:from-slate-900"
            ></div>
          </div>

          <div class="mt-3 flex items-center gap-2">
            <Avatar.Root class="h-6 w-6 text-[10px]">
              {#if post.authorImage}
                <Avatar.Image src={post.authorImage} alt={post.authorName} />
              {/if}
              <Avatar.Fallback class="bg-primary/10 text-primary">
                {getInitials(post.authorName)}
              </Avatar.Fallback>
            </Avatar.Root>
            <span class="text-xs text-slate-500">
              {post.authorName}
            </span>
            <span class="text-xs text-slate-300 dark:text-slate-600">·</span>
            <time class="text-xs text-slate-400" datetime={post.publishedAt}>
              {dateFmt.format(new Date(post.publishedAt))}
            </time>
          </div>
        </button>
      {/each}
    </div>
  {:else}
    <div
      class="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center dark:border-slate-800 dark:bg-slate-900/50"
    >
      <Inbox class="mb-4 h-8 w-8 text-slate-400" />
      <h3 class="text-lg font-bold text-slate-700 dark:text-slate-300">
        Aucune actualité pour le moment
      </h3>
      <p class="mt-2 max-w-sm text-sm text-slate-500">
        Les actualités de ton campus apparaîtront ici.
      </p>
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
