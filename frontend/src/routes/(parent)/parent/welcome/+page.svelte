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
        class="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-epi-blue text-white shadow-raised"
      >
        <Heart class="h-7 w-7" />
      </div>

      <div
        class="rounded-xl border border-border/60 bg-card px-6 py-8 shadow-raised"
      >
        <h1 class="mb-4 font-heading text-display-m text-epi-blue">
          Bonjour, et bienvenue.
        </h1>

        <p class="mb-6 text-sm leading-relaxed text-foreground-secondary">
          {data.childPrenom} s'apprête à vivre quelques jours immersifs chez
          <strong
            >Epitech pour lui permettre de découvrir la tech et trouver son
            orientation</strong
          > : ateliers, défis, rencontres avec une promo curieuse et motivée. Nos
          équipes ont hâte de l'accueillir.
        </p>

        <p class="mb-8 text-sm leading-relaxed text-foreground-secondary">
          Avant cela, deux étapes côté famille : la signature du règlement
          intérieur, puis votre réponse au droit à l'image.
        </p>

        <Button
          href={resolve('/parent/reglement')}
          class="h-auto w-full rounded-xl bg-epi-tech px-6 py-3 text-black shadow-raised transition-ui duration-200 hover:bg-epi-tech hover:brightness-110"
        >
          Continuer
        </Button>
      </div>
    </div>
  </main>
</ParentFlowShell>
