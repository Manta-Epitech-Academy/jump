<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Camera } from '@lucide/svelte';

  let { error }: { error?: string } = $props();

  let accepted = $state(false);
  let signerName = $state('');

  const canSubmit = $derived(accepted && signerName.trim().length >= 2);
</script>

<!-- Header -->
<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <Camera class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Droit &agrave; l'image
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Cette &eacute;tape doit &ecirc;tre compl&eacute;t&eacute;e par un parent
    ou repr&eacute;sentant l&eacute;gal.
  </p>
</div>

<!-- Document content -->
<div
  class="max-h-[50vh] overflow-y-auto rounded-2xl border-none bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-slate-900/80"
>
  <p
    class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
  >
    Le contenu de l'autorisation de droit &agrave; l'image sera
    bient&ocirc;t disponible.
  </p>
</div>

<!-- Sign form -->
<form method="POST" action="?/signImageRights" use:enhance class="mt-6">
  {#if error}
    <p
      class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
    >
      {error}
    </p>
  {/if}

  <div
    class="mb-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <label
      for="signerName"
      class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
    >
      Nom complet du parent ou repr&eacute;sentant l&eacute;gal
    </label>
    <input
      id="signerName"
      name="signerName"
      type="text"
      bind:value={signerName}
      placeholder="Pr&eacute;nom Nom"
      required
      class="w-full border-0 bg-transparent p-0 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-0 dark:text-white"
    />
  </div>

  <label
    class="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <input
      type="checkbox"
      bind:checked={accepted}
      class="h-5 w-5 shrink-0 rounded border-slate-300 text-epi-teal accent-epi-teal focus:ring-epi-teal"
    />
    <span class="text-sm text-slate-700 dark:text-slate-300">
      En tant que repr&eacute;sentant l&eacute;gal, j'autorise l'utilisation
      de l'image de mon enfant
    </span>
  </label>

  <Button
    type="submit"
    disabled={!canSubmit}
    class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
  >
    Signer
  </Button>
</form>
