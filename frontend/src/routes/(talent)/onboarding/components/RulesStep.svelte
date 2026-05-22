<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import BookOpen from '@lucide/svelte/icons/book-open';
  import { renderMarkdown } from '$lib/markdown';
  import reglementMd from '$lib/content/reglement-interieur.md?raw';
  import { track } from '$lib/analytics';
  import { triggerConfetti } from '$lib/actions/confetti';
  import { fly } from 'svelte/transition';

  let { error: formError }: { error?: string } = $props();

  let submitting = $state(false);
  let city = $state('');
  let completed = $state(false);
  let signed = $state(false);

  // Remove the "Fait à" placeholder line — it's rendered as inline inputs below
  const contentWithoutSignature = reglementMd.replace(
    /\n\*\*Fait à \{\{city\}\}.*$/m,
    '',
  );
  const renderedContent = renderMarkdown(contentWithoutSignature);
</script>

{#if !completed}
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
    <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
      Prends connaissance du règlement avant de continuer.
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
    action="?/signRules"
    use:enhance={() => {
      submitting = true;
      return async ({ result, update }) => {
        if (result.type === 'redirect') {
          track('rules_signed');
          track('onboarding_completed');
          completed = true;
          triggerConfetti();
          setTimeout(() => {
            update();
          }, 2500);
          return;
        }
        if (result.type === 'failure') {
          track('rules_signing_failed');
        }
        await update();
        submitting = false;
      };
    }}
  >
    <!-- Document content — displayed directly in the page, no container box -->
    <div class="prose prose-sm max-w-none prose-slate dark:prose-invert">
      {@html renderedContent}

      <p class="mt-6 text-sm">
        <strong>Fait à</strong>
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

    <div class="mt-8 space-y-4">
      <label
        class="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <input
          type="checkbox"
          bind:checked={signed}
          class="h-5 w-5 shrink-0 rounded border-slate-300 text-epi-teal accent-epi-teal focus:ring-epi-teal"
        />
        <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
          Je signe le règlement intérieur
        </span>
      </label>

      <Button
        type="submit"
        disabled={!signed || !city.trim() || submitting}
        class="h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
      >
        Continuer
      </Button>
    </div>
  </form>
{/if}

{#if completed}
  <div
    class="flex flex-col items-center justify-center gap-4 py-12"
    in:fly={{ y: 20, duration: 400 }}
  >
    <h1
      class="font-heading text-4xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
    >
      Bienvenue chez Jump !
    </h1>
    <p class="text-sm text-slate-500 dark:text-slate-400">
      Ton aventure commence maintenant.
    </p>
  </div>
{/if}
