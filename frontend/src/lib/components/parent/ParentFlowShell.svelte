<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Snippet } from 'svelte';

  // Shared frame for the parent onboarding flow (welcome → signature → merci):
  // background decorations, sticky Epitech header, sticky footer. Pages provide
  // their own <main> via `children` so each controls its own scroll/centering.
  let { children }: { children: Snippet } = $props();
</script>

<div
  class="relative flex h-screen w-full flex-col overflow-hidden bg-slate-100 transition-colors duration-500 dark:bg-slate-950"
>
  <!-- Background decorations -->
  <div
    class="absolute -top-20 -right-20 h-100 w-100 rounded-full bg-epi-blue/15 blur-[100px] dark:bg-epi-blue/20"
  ></div>
  <div
    class="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-epi-teal/15 blur-[100px] dark:bg-epi-teal/20"
  ></div>
  <div
    class="absolute inset-0 bg-[radial-gradient(var(--color-slate-300)_1px,transparent_1px)] bg-size-[32px_32px] opacity-70 dark:bg-[radial-gradient(var(--color-slate-800)_1px,transparent_1px)] dark:opacity-50"
  ></div>

  <!-- ═══ Header sticky ═══ -->
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

  {@render children()}

  <!-- ═══ Footer sticky ═══ -->
  <footer
    class="relative z-10 shrink-0 border-t border-slate-300/50 bg-slate-100/80 px-4 py-4 text-center text-xs text-slate-400 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-950/80 dark:text-slate-500"
  >
    <span class="font-heading tracking-wide text-epi-blue">Jump</span>, la
    plateforme qui accompagne votre enfant tout au long de son parcours à
    Epitech.
  </footer>
</div>
