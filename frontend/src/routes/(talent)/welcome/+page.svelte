<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowRight, Rocket } from '@lucide/svelte';

  let { data }: { data: PageData } = $props();
</script>

<div class="mx-auto max-w-3xl px-4 py-12">
  {#if data.cmsContent}
    <div class="prose max-w-none prose-slate dark:prose-invert">
      {@html data.cmsContent}
    </div>
  {:else}
    <div
      class="flex flex-col items-center justify-center gap-6 py-20 text-center"
    >
      <Rocket class="h-16 w-16 text-epi-teal" />
      <h1 class="text-3xl font-bold">Bienvenue sur la plateforme !</h1>
      <p class="max-w-md text-lg text-muted-foreground">
        Ton espace est en cours de préparation. En attendant, tu peux accéder à
        ton tableau de bord.
      </p>
    </div>
  {/if}

  <div class="mt-8 flex justify-center">
    <form method="POST" action="?/markSeen" use:enhance>
      <Button type="submit">
        Accéder au tableau de bord
        <ArrowRight class="ml-2 h-4 w-4" />
      </Button>
    </form>
  </div>
</div>
