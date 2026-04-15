<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { KeyRound, Camera, CheckCircle } from '@lucide/svelte';

  let { form } = $props();

  let signerName = $state('');
  let accepted = $state(false);

  const currentStep = $derived(form?.step ?? 'code');
  const canSign = $derived(accepted && signerName.trim().length >= 2);
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
    {#if currentStep === 'code'}
      <!-- Step: Enter code -->
      <div class="mb-6 text-center">
        <div
          class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
        >
          <KeyRound class="h-7 w-7" />
        </div>
        <h1
          class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
        >
          Autorisation parentale
        </h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Entrez le code reçu par email pour accéder au document.
        </p>
      </div>

      <form method="POST" action="?/verify" use:enhance>
        {#if form?.error && currentStep === 'code'}
          <p
            class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
          >
            {form.error}
          </p>
        {/if}

        <div
          class="rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
        >
          <label
            for="code"
            class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >Code d'accès</label
          >
          <input
            id="code"
            name="code"
            type="text"
            maxlength="6"
            placeholder="ABC123"
            required
            class="w-full border-0 bg-transparent p-0 text-center font-mono text-2xl tracking-widest text-slate-900 placeholder:text-slate-300 focus:ring-0 dark:text-white"
          />
        </div>

        <Button
          type="submit"
          class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
        >
          Vérifier le code
        </Button>
      </form>
    {:else if currentStep === 'sign'}
      <!-- Step: Sign document -->
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
          Document concernant <strong>{form?.studentName}</strong>
        </p>
      </div>

      <div
        class="max-h-[50vh] overflow-y-auto rounded-2xl border-none bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-slate-900/80"
      >
        <div class="prose prose-sm prose-slate dark:prose-invert max-w-none">
          <p>
            Je soussign&eacute;(e), agissant en qualit&eacute; de repr&eacute;sentant l&eacute;gal, autorise <strong>Epitech</strong> &agrave; utiliser l'image de mon enfant <strong>{form?.studentName}</strong> dans le cadre du stage de seconde.
          </p>
          <p>
            Je certifie avoir pris connaissance des dispositions du droit &agrave; l'image, telles que pr&eacute;vues par la loi, et &ecirc;tre inform&eacute;(e) que je peux &agrave; tout moment r&eacute;voquer mon consentement et demander la cessation de l'utilisation de l'image de mon enfant, en adressant une demande &eacute;crite &agrave; <strong>Epitech</strong>.
          </p>
          <p>
            Je m'engage &agrave; ne pas porter atteinte aux droits d'<strong>Epitech</strong> et &agrave; ne pas utiliser l'image de mon enfant &agrave; des fins contraires &agrave; la loi ou aux bonnes m&oelig;urs.
          </p>
        </div>
      </div>

      <form method="POST" action="?/sign" use:enhance class="mt-6">
        <input type="hidden" name="code" value={form?.code} />

        {#if form?.error && currentStep === 'sign'}
          <p
            class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
          >
            {form.error}
          </p>
        {/if}

        <div
          class="mb-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
        >
          <label
            for="signerName"
            class="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
            >Votre nom complet</label
          >
          <input
            id="signerName"
            name="signerName"
            type="text"
            bind:value={signerName}
            placeholder="Prénom Nom"
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
            En tant que représentant légal, j'autorise l'utilisation de l'image
            de mon enfant
          </span>
        </label>

        <Button
          type="submit"
          disabled={!canSign}
          class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
        >
          Signer
        </Button>
      </form>
    {:else if currentStep === 'done'}
      <!-- Step: Confirmation -->
      <div class="text-center">
        <div
          class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-500 text-white shadow-lg shadow-green-500/20"
        >
          <CheckCircle class="h-7 w-7" />
        </div>
        <h1
          class="font-heading text-2xl tracking-tight text-green-600 uppercase dark:text-green-400"
        >
          Merci !
        </h1>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
          L'autorisation de droit &agrave; l'image a &eacute;t&eacute; sign&eacute;e avec succ&egrave;s. Merci pour votre confiance.
        </p>
      </div>
    {/if}

    <p
      class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase"
    >
      Propulsé par Epitech Academy
    </p>
  </div>
</div>
