<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import WelcomeMessageBody from '$lib/components/talent/WelcomeMessageBody.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Mail from '@lucide/svelte/icons/mail';
  import { onMount } from 'svelte';
  import { track } from '$lib/analytics';

  let { data }: { data: PageData } = $props();

  onMount(() => {
    track('welcome_seen');
  });
</script>

<div class="mx-auto max-w-2xl px-4 py-12">
  <!-- Shape-congruent with the dashboard's Actualités card so the shared
       `welcome-message` view-transition morphs cleanly: on "Accéder", this card
       travels into the feed instead of vanishing. -->
  <div
    style="view-transition-name: welcome-message"
    class="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
  >
    <div
      class="flex items-center gap-2 border-b border-slate-100 bg-blue-50/50 px-6 py-4 text-xs font-bold text-epi-blue uppercase dark:border-slate-800 dark:bg-blue-950/20"
    >
      <Mail class="h-4 w-4" />
      Message de bienvenue
    </div>
    <div class="p-6">
      <WelcomeMessageBody content={data.cmsContent} />
    </div>
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
          Accéder au tableau de bord
          <ArrowRight class="ml-2 h-4 w-4" />
        </Button>
      </form>
    {/if}
  </div>
</div>
