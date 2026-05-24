<!-- frontend/src/routes/(talent)/onboarding/components/CharterStep.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import ShieldCheck from '@lucide/svelte/icons/shield-check';
  import { track, errReason, secondsBetween } from '$lib/analytics';
  import ContinueButton from './ContinueButton.svelte';

  let { error: formError }: { error?: string } = $props();

  const seenAt = Date.now();
  let accepted = $state(false);
  let submitting = $state(false);
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <ShieldCheck class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Sécurité des Données
  </h1>
  <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
    Avant de commencer, prenons un instant pour tes données.
  </p>
</div>

{#if formError}
  <p
    class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
  >
    {formError}
  </p>
{/if}

<form
  method="POST"
  action="?/acceptCharter"
  use:enhance={() => {
    submitting = true;
    return async ({ result, update }) => {
      if (result.type === 'success') {
        track('charter_signed', { secondsToSign: secondsBetween(seenAt) });
        await invalidateAll();
        return;
      }
      if (result.type === 'failure') {
        track('charter_signing_failed', { reason: errReason(result) });
      }
      await update();
      submitting = false;
    };
  }}
>
  <div class="prose prose-sm max-w-none prose-slate dark:prose-invert">
    <h2>Quelles données collectons-nous ?</h2>
    <p>
      Ton nom, prénom, et ta progression pédagogique : étapes complétées,
      compétences validées, points d'expérience (XP), badges obtenus, et les
      créations de ton portfolio.
    </p>

    <h2>Pourquoi ?</h2>
    <p>
      Pour suivre ta progression, générer tes certifications, et te permettre de
      partager ton portfolio.
    </p>

    <h2>Combien de temps ?</h2>
    <p>
      Tes données sont conservées 6 mois après ta dernière activité sur la
      plateforme. Passé ce délai, elles sont automatiquement anonymisées.
    </p>

    <h2>Tes droits</h2>
    <p>
      Tu peux à tout moment consulter, modifier ou supprimer tes données depuis
      ton espace personnel. Tu peux aussi demander la suppression complète de
      ton compte.
    </p>

    <h2>Où sont stockées tes données ?</h2>
    <p>Sur un serveur situé en France, géré par l'équipe Epitech.</p>
  </div>

  <div class="mt-6 space-y-4">
    <label
      class="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <Checkbox
        bind:checked={accepted}
        class="size-5 shrink-0 data-[state=checked]:border-epi-teal data-[state=checked]:bg-epi-teal data-[state=checked]:text-black"
      />
      <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
        Je suis prêt(e) à coder en toute sécurité 🛡️
      </span>
    </label>

    <ContinueButton {submitting} disabled={!accepted}>
      Étape suivante
    </ContinueButton>
  </div>
</form>
