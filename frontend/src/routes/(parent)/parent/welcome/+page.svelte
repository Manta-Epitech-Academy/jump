<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from '$lib/components/ui/button';
  import Heart from '@lucide/svelte/icons/heart';

  let { data } = $props();
</script>

<svelte:head>
  <title>Bienvenue — Espace Parent</title>
</svelte:head>

<div
  class="relative flex h-screen w-full flex-col overflow-hidden bg-slate-100 transition-colors duration-500 dark:bg-slate-950"
>
  <div
    class="absolute -top-20 -right-20 h-100 w-100 rounded-full bg-epi-blue/15 blur-[100px] dark:bg-epi-blue/20"
  ></div>
  <div
    class="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-epi-teal/15 blur-[100px] dark:bg-epi-teal/20"
  ></div>
  <div
    class="absolute inset-0 bg-[radial-gradient(var(--color-slate-300)_1px,transparent_1px)] bg-size-[32px_32px] opacity-70 dark:bg-[radial-gradient(var(--color-slate-800)_1px,transparent_1px)] dark:opacity-50"
  ></div>

  <header
    class="relative z-10 shrink-0 border-b border-slate-300/50 bg-slate-100/80 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-950/80"
  >
    <div
      class="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3"
    >
      <a href={resolve('/')} aria-label="Accueil">
        <img
          src="/EPITECH-LOGO-BLEU-2025.svg"
          alt="Epitech"
          class="h-7 w-auto dark:brightness-0 dark:invert"
        />
      </a>
      <span class="text-xs font-semibold text-slate-400 dark:text-slate-500">
        Espace Parent
      </span>
    </div>
  </header>

  <main class="relative z-10 flex flex-1 items-center justify-center p-4">
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

  <footer
    class="relative z-10 shrink-0 border-t border-slate-300/50 bg-slate-100/80 px-4 py-4 text-center text-xs text-slate-400 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-950/80 dark:text-slate-500"
  >
    <span class="font-heading tracking-wide text-epi-blue">Jump</span>, la
    plateforme qui t'accompagne lors de tes stages et coding clubs à Epitech.
  </footer>
</div>
