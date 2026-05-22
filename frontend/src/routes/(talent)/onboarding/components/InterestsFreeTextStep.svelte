<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import MessageSquare from '@lucide/svelte/icons/message-square';

  let {
    techInterestIds,
    generalInterestIds,
    freeText = '',
    error,
  }: {
    techInterestIds: string[];
    generalInterestIds: string[];
    freeText?: string;
    error?: string;
  } = $props();
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <MessageSquare class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Autre chose ?
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Dis-nous en plus si tu veux, c'est facultatif.
  </p>
</div>

{#if error}
  <p
    class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
  >
    {error}
  </p>
{/if}

<form method="POST" action="?/validateInterests" use:enhance class="space-y-4">
  {#each techInterestIds as id}
    <input type="hidden" name="techInterestIds" value={id} />
  {/each}
  {#each generalInterestIds as id}
    <input type="hidden" name="generalInterestIds" value={id} />
  {/each}

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="freeText"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Autre chose à nous dire sur tes centres d'intérêt ?
    </label>
    <textarea
      id="freeText"
      name="freeText"
      rows="3"
      maxlength="500"
      value={freeText}
      placeholder="Raconte-nous..."
      class="w-full resize-none rounded-lg border border-transparent bg-transparent p-1 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
    ></textarea>
  </div>

  <Button
    type="submit"
    class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
  >
    Continuer
  </Button>
</form>
