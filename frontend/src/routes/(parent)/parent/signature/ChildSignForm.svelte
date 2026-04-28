<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';

  interface Props {
    child: { id: string; prenom: string; nom: string };
    droitImageBody: string;
    error?: string;
  }

  let { child, droitImageBody, error }: Props = $props();

  let signerName = $state('');
  let relationship = $state('');
  let city = $state('');
  let accepted = $state(false);
  let submitting = $state(false);

  const canSign = $derived(
    accepted &&
      signerName.trim().length >= 2 &&
      relationship !== '' &&
      city.trim().length >= 1 &&
      !submitting,
  );
</script>

<div
  class="mb-6 overflow-hidden rounded-3xl bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-slate-900/80"
>
  <div class="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
    <h2 class="text-base font-bold text-slate-900 dark:text-white">
      {child.prenom}
      {child.nom}
    </h2>
  </div>

  <form
    method="POST"
    action="?/sign"
    use:enhance={() => {
      submitting = true;
      return async ({ update }) => {
        await update();
        submitting = false;
      };
    }}
  >
    <input type="hidden" name="talentId" value={child.id} />

    {#if error}
      <p
        class="mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
      >
        {error}
      </p>
    {/if}

    <div class="max-h-[50vh] overflow-y-auto p-6">
      <div class="prose prose-sm max-w-none prose-slate dark:prose-invert">
        <p>
          Je soussign&eacute;(e), Mme/Mr
          <input
            name="signerName"
            type="text"
            bind:value={signerName}
            placeholder="___________________"
            required
            class="inline-block w-44 border-0 border-b border-slate-300 bg-transparent px-1 text-center text-sm font-semibold text-slate-900 placeholder:text-slate-300 focus:border-epi-blue focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
          />
          agissant en qualit&eacute; de
          <select
            name="relationship"
            bind:value={relationship}
            required
            class="inline-block w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-sm font-semibold text-slate-900 focus:border-epi-blue focus:ring-0 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          >
            <option value="" disabled class="text-slate-400">(choisir)</option>
            <option value="mère">mère</option>
            <option value="père">père</option>
            <option value="tuteur légal">tuteur légal</option>
            <option value="tutrice légale">tutrice légale</option>
          </select>, autorise <strong>Epitech</strong> à utiliser l'image de mon
          enfant
          <strong>{child.prenom} {child.nom}</strong> dans le cadre du stage de seconde.
        </p>
        {@html droitImageBody}

        <p class="mt-6">
          <strong>Fait &agrave;</strong>
          <input
            name="city"
            type="text"
            bind:value={city}
            placeholder="__________________"
            required
            class="inline-block w-40 border-0 border-b border-slate-300 bg-transparent px-1 text-center text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue focus:ring-0 dark:text-white dark:placeholder:text-slate-600"
          /><strong
            >, le {new Date().toLocaleDateString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}</strong
          >
        </p>
      </div>
    </div>

    <div class="px-6 pb-6">
      <label
        class="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/50"
      >
        <input
          type="checkbox"
          name="accepted"
          bind:checked={accepted}
          class="h-5 w-5 shrink-0 rounded border-slate-300 text-epi-teal accent-epi-teal focus:ring-epi-teal"
        />
        <span class="text-sm text-slate-700 dark:text-slate-300">
          En tant que représentant légal, j'autorise l'utilisation de l'image de
          mon enfant
        </span>
      </label>

      <Button
        type="submit"
        disabled={!canSign}
        class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110 disabled:opacity-50"
      >
        {#if submitting}
          Signature en cours...
        {:else}
          Signer pour {child.prenom}
        {/if}
      </Button>
    </div>
  </form>
</div>
