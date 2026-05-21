<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import Laptop from '@lucide/svelte/icons/laptop';

  let {
    hasLaptop = false,
    setupDescription = '',
    error,
  }: {
    hasLaptop?: boolean;
    setupDescription?: string;
    error?: string;
  } = $props();

  // svelte-ignore state_referenced_locally
  let checked = $state(hasLaptop);
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <Laptop class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Ton matériel
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Parle-nous de ta config
  </p>
</div>

{#if error}
  <p
    class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
  >
    {error}
  </p>
{/if}

<form method="POST" action="?/validateEquipment" use:enhance class="space-y-4">
  <input type="hidden" name="hasLaptop" value={checked ? 'true' : 'false'} />

  <label
    class="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-4 py-4 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <input
      type="checkbox"
      bind:checked
      class="h-5 w-5 shrink-0 rounded border-slate-300 text-epi-teal accent-epi-teal focus:ring-epi-teal"
    />
    <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
      Je possède un laptop qui fonctionne pour réaliser mon stage.
    </span>
  </label>

  <div
    class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="setupDescription"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Tu as un setup particulier à la maison ? Décris-nous ta configuration : PC
      fixe, GPU, écrans, casque VR, etc.
    </label>
    <textarea
      id="setupDescription"
      name="setupDescription"
      rows="4"
      maxlength="1000"
      value={setupDescription}
      placeholder="Mon PC gaming, mes écrans, ma config..."
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
