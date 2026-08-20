<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Snippet } from 'svelte';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';

  // Shared frame for the parent onboarding flow (welcome → règlement →
  // signature → merci):
  // background decorations, sticky Epitech header, sticky footer. Pages provide
  // their own <main> via `children` so each controls its own scroll/centering.
  let { children }: { children: Snippet } = $props();
</script>

<div
  class="parent-layout relative flex h-dvh w-full flex-col overflow-hidden bg-slate-100 transition-colors duration-300 dark:bg-slate-950"
>
  <!-- Background decorations -->
  <div
    class="absolute -top-20 -right-20 h-100 w-100 rounded-full bg-epi-blue/15 blur-[100px] dark:bg-epi-blue/20"
  ></div>
  <div
    class="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-epi-tech/15 blur-[100px] dark:bg-epi-tech/20"
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
        <EpitechLogo class="h-7 w-auto" />
      </a>
      <span class="text-xs font-semibold text-slate-400 dark:text-slate-500">
        Espace Parent
      </span>
    </div>
  </header>

  {@render children()}

  <!-- ═══ Footer ═══
       Background-less by design, mirroring the talent's `TalentFooter` so the
       same chrome carries across both spaces and the family doesn't feel a
       different app on each side. -->
  <footer
    class="relative z-10 shrink-0 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400"
  >
    <span class="font-heading text-epi-blue">Jump</span>, la plateforme qui
    accompagne votre enfant tout au long de son parcours à Epitech.
  </footer>
</div>
