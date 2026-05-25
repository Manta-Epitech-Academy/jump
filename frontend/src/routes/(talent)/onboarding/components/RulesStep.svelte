<!-- frontend/src/routes/(talent)/onboarding/components/RulesStep.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import { renderMarkdown } from '$lib/markdown';
  import reglementMd from '$lib/content/reglement-interieur.md?raw';
  import { track, errReason, secondsBetween } from '$lib/analytics';
  import { WELCOME_XP_BONUS } from '$lib/domain/xp';
  import ContinueButton from './ContinueButton.svelte';

  let { error: formError }: { error?: string } = $props();
  const seenAt = Date.now();
  let submitting = $state(false);
  let city = $state('');
  let signed = $state(false);

  const contentWithoutSignature = reglementMd.replace(
    /\n\*\*Fait à \{\{city\}\}.*$/m,
    '',
  );
  const renderedContent = renderMarkdown(contentWithoutSignature);
</script>

<div class="mb-6 text-center">
  <div
    class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
  >
    <BookOpen class="h-7 w-7" />
  </div>
  <h1
    class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
  >
    Règlement Intérieur
  </h1>
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
  action="?/signRules"
  use:enhance={() => {
    submitting = true;
    return async ({ result, update }) => {
      if (result.type === 'redirect') {
        track('rules_signed', { secondsToSign: secondsBetween(seenAt) });
        track('onboarding_completed', { step: 'rules' });
        goto(result.location, { invalidateAll: true });
        return;
      }
      if (result.type === 'failure') {
        track('rules_signing_failed', { reason: errReason(result) });
      }
      await update();
      submitting = false;
    };
  }}
>
  <div class="prose prose-sm max-w-none prose-slate dark:prose-invert">
    {@html renderedContent}
  </div>

  <div
    class="mt-6 flex items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
  >
    <span class="text-sm font-medium text-slate-700 dark:text-slate-300"
      >Fait à</span
    >
    <input
      name="city"
      type="text"
      bind:value={city}
      placeholder="Ville"
      required
      class="w-40 rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-300 focus:border-epi-blue/40 focus:ring-0 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white dark:placeholder:text-slate-600"
    />
    <span class="text-sm font-medium text-slate-700 dark:text-slate-300"
      >, le {new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })}</span
    >
  </div>

  <div class="mt-8 space-y-4">
    <label
      class="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <Checkbox
        bind:checked={signed}
        class="size-5 shrink-0 data-[state=checked]:border-epi-teal data-[state=checked]:bg-epi-teal data-[state=checked]:text-black"
      />
      <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
        Je m'engage à respecter le règlement
      </span>
    </label>

    <div
      class="flex items-center justify-center gap-2 rounded-xl bg-epi-teal/10 px-4 py-2.5 text-center text-sm font-medium text-epi-teal-solid dark:text-epi-teal"
    >
      <Sparkles class="h-4 w-4 shrink-0" />
      Dernière étape pour gagner tes {WELCOME_XP_BONUS} XP de bienvenue !
    </div>

    <ContinueButton {submitting} disabled={!signed || !city.trim()}>
      Signer et obtenir mes {WELCOME_XP_BONUS} XP ✨
    </ContinueButton>
  </div>
</form>
