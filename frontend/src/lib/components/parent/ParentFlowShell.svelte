<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Snippet } from 'svelte';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import BrandBackdrop from '$lib/components/layout/BrandBackdrop.svelte';

  // Shared frame for the parent onboarding flow (welcome → règlement →
  // signature → merci):
  // background decorations, sticky Epitech header, sticky footer. Pages provide
  // their own <main> via `children` so each controls its own scroll/centering.
  let { children }: { children: Snippet } = $props();
</script>

<div
  class="parent-layout relative flex h-dvh w-full flex-col overflow-hidden bg-muted transition-colors duration-300"
>
  <BrandBackdrop />

  <!-- ═══ Header sticky ═══ -->
  <header class="relative z-10 shrink-0 border-b border-border/50 bg-muted">
    <div
      class="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3"
    >
      <a href={resolve('/')} aria-label="Accueil">
        <EpitechLogo class="h-7 w-auto" />
      </a>
      <span class="text-xs font-semibold text-muted-foreground">
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
    class="relative z-10 shrink-0 px-4 py-6 text-center text-sm text-muted-foreground"
  >
    <span class="font-heading text-epi-blue">Jump</span>, la plateforme qui
    accompagne votre enfant tout au long de son parcours à Epitech.
  </footer>
</div>
