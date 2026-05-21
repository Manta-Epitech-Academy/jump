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

<div class="mx-auto max-w-3xl px-4 py-12">
  <div class="prose max-w-none prose-slate dark:prose-invert">
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
        <Button type="submit">
          On y va
          <ArrowRight class="ml-2 h-4 w-4" />
        </Button>
      </form>
    {/if}
  </div>
</div>
