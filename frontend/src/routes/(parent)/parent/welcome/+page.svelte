<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import ParentFlowShell from '$lib/components/parent/ParentFlowShell.svelte';
  import Heart from '@lucide/svelte/icons/heart';

  let { data } = $props();
</script>

<svelte:head>
  <title>Bienvenue — Espace Parent</title>
</svelte:head>

<ParentFlowShell>
  <main
    class="relative z-10 flex flex-1 items-center justify-center overflow-y-auto p-4"
  >
    <div class="w-full max-w-lg text-center">
      <div
        class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
      >
        <Heart class="h-7 w-7" />
      </div>

      <div
        class="rounded-2xl border border-slate-200/60 bg-white/80 px-6 py-8 shadow-sm backdrop-blur-xl dark:bg-slate-900/80"
      >
        <h1
          class="mb-4 font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
        >
          Bonjour, et bienvenue.
        </h1>

        <p
          class="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
        >
          {data.childPrenom} s'apprête à vivre quelques jours immersifs chez
          <strong
            >Epitech pour lui permettre de découvrir la tech et trouver son
            orientation</strong
          > : ateliers, défis, rencontres avec une promo curieuse et motivée. Nos
          équipes ont hâte de l'accueillir.
        </p>

        <p
          class="mb-8 text-sm leading-relaxed text-slate-600 dark:text-slate-300"
        >
          Avant cela, une étape côté famille : votre réponse au droit à l'image.
        </p>

        <a href={resolve('/parent/signature')}>
          <Button
            class="h-auto w-full rounded-2xl bg-epi-teal px-6 py-3 text-black shadow-lg shadow-epi-teal/20 transition-all duration-200 hover:bg-epi-teal hover:brightness-110"
          >
            Donner ma réponse
          </Button>
        </a>
      </div>
    </div>
  </main>
</ParentFlowShell>
