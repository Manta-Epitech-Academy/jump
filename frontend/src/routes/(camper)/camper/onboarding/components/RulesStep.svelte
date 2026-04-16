<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { BookOpen } from '@lucide/svelte';
  import { marked } from 'marked';
  import reglementMd from '$lib/content/reglement-interieur.md?raw';

  let accepted = $state(false);
  let submitting = $state(false);
  let city = $state('');

  // Remove the "Fait à" placeholder line — it's rendered as inline inputs below
  const contentWithoutSignature = reglementMd.replace(
    /\n\*\*Fait à \{\{city\}\}.*$/,
    '',
  );
  const renderedContent = marked.parse(contentWithoutSignature) as string;
</script>

<!-- Header -->
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

<form
  method="POST"
  action="?/signRules"
  use:enhance={() => {
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  }}
>
  <!-- Document content -->
  <div
    class="max-h-[50vh] overflow-y-auto rounded-2xl border-none bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-slate-900/80"
  >
    <div class="markdown-content max-w-none text-sm">
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
  </div>

  <div class="mt-6 space-y-3">
    <label
      class="flex cursor-pointer items-center gap-3 rounded-xl bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
    >
      <input
        type="checkbox"
        bind:checked={accepted}
        class="h-5 w-5 shrink-0 rounded border-slate-300 text-epi-teal accent-epi-teal focus:ring-epi-teal"
      />
      <span class="text-sm text-slate-700 dark:text-slate-300">
        J'ai lu et j'accepte le règlement intérieur
      </span>
    </label>

    <Button
      type="submit"
      disabled={!accepted || !city.trim() || submitting}
      class="mt-4 h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
    >
      Signer et continuer
    </Button>
  </div>
</form>
