<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import { onMount } from 'svelte';
  import { track } from '$lib/analytics';

  let { data }: { data: PageData } = $props();

  onMount(() => {
    track('welcome_seen');
  });
</script>

<div
  class="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 p-4 transition-colors duration-500 dark:bg-slate-950"
>
  <div
    class="absolute -top-20 -right-20 h-100 w-100 rounded-full bg-epi-blue/10 blur-[100px] dark:bg-epi-blue/20"
  ></div>
  <div
    class="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-epi-teal/10 blur-[100px] dark:bg-epi-teal/20"
  ></div>
  <div
    class="absolute inset-0 bg-[radial-gradient(var(--color-slate-200)_1px,transparent_1px)] bg-size-[32px_32px] opacity-50 dark:bg-[radial-gradient(var(--color-slate-800)_1px,transparent_1px)]"
  ></div>

  <div class="z-10 w-full max-w-lg">
    <div class="prose prose-sm max-w-none prose-slate dark:prose-invert">
      {@html data.cmsContent}
    </div>

    <div class="mt-8 flex justify-center">
      {#if data.alreadySeen}
        <Button href="/">
          Retour au tableau de bord
          <ArrowRight class="ml-2 h-4 w-4" />
        </Button>
      {:else}
        <form
          method="POST"
          action="?/markSeen"
          use:enhance={() => {
            return async ({ update }) => {
              track('welcome_dismissed');
              await update();
            };
          }}
        >
          <Button
            type="submit"
            class="h-auto rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
          >
            On y va
            <ArrowRight class="ml-2 h-4 w-4" />
          </Button>
        </form>
      {/if}
    </div>

    <p
      class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase"
    >
      Propuls&eacute; par Epitech Academy
    </p>
  </div>
</div>
