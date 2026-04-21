<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { Camera, CheckCircle } from '@lucide/svelte';
  import { cn } from '$lib/utils';
  import { marked } from 'marked';
  import droitImageBodyMd from '$lib/content/droit-image-body.md?raw';
  import { fly } from 'svelte/transition';

  const droitImageBody = marked.parse(droitImageBodyMd) as string;

  let { data, form } = $props();

  // Single-child state (reactive like the old working version)
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
        Droit à l'image
      </h1>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {#if data.children.length > 1}
          Veuillez signer pour chacun de vos enfants
        {:else}
          Veuillez signer pour votre enfant
        {/if}
      </p>
    </div>

    <!-- Success message -->
    {#if form?.success}
      <div
        in:fly={{ y: -10, duration: 300 }}
        class="mb-4 flex items-center gap-3 rounded-xl bg-green-50 px-4 py-3 dark:bg-green-900/30"
      >
        <CheckCircle
          class="h-5 w-5 shrink-0 text-green-600 dark:text-green-400"
        />
        <p class="text-sm text-green-700 dark:text-green-300">
          L'autorisation pour <strong>{form.success}</strong> a été signée avec succès.
        </p>
      </div>
    {/if}

    <!-- Global error (not scoped to a child) -->
    {#if form?.error && !form?.talentId}
      <p
        class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
      >
        {form.error}
      </p>
    {/if}

    <!-- Per-child forms -->
    {#each data.children as child (child.id)}
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

          <!-- Per-child error -->
          {#if form?.error && form?.talentId === child.id}
            <p
              class="mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
            >
              {form.error}
            </p>
          {/if}

          <!-- Document content -->
          <div class="max-h-[50vh] overflow-y-auto p-6">
            <div class="markdown-content max-w-none text-sm">
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
                  <option value="" disabled class="text-slate-400"
                    >(choisir)</option
                  >
                  <option value="mère">mère</option>
                  <option value="père">père</option>
                  <option value="tuteur légal">tuteur légal</option>
                  <option value="tutrice légale">tutrice légale</option>
                </select>, autorise <strong>Epitech</strong> à utiliser l'image
                de mon enfant
                <strong>{child.prenom} {child.nom}</strong> dans le cadre du stage
                de seconde.
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

          <!-- Checkbox + submit -->
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
                En tant que représentant légal, j'autorise l'utilisation de
                l'image de mon enfant
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
    {/each}

    <p
      class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase"
    >
      Espace Parents — Epitech Academy
    </p>
  </div>
</div>
