<script lang="ts">
  // Lightweight talent-space header: Epitech logo (home) + optional title +
  // theme toggle. Used by the daily-training and leaderboard pages so they
  // carry the same chrome as the dashboard instead of feeling like a detour out
  // of the app. The dashboard keeps its own greeting-rich header.
  import { resolve } from '$app/paths';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import ModeToggle from '$lib/components/ModeToggle.svelte';

  let { title }: { title?: string } = $props();
</script>

<header
  class="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap sm:gap-x-4"
>
  <a href={resolve('/')} aria-label="Accueil" class="shrink-0">
    <EpitechLogo class="h-8 w-auto" />
  </a>
  {#if title}
    <div
      class="hidden h-8 w-px shrink-0 bg-slate-200 sm:block dark:bg-slate-800"
      aria-hidden="true"
    ></div>
    <h1
      class="order-last w-full min-w-0 truncate font-heading text-xl tracking-tight text-slate-900 uppercase sm:order-none sm:w-auto sm:text-2xl dark:text-white"
    >
      {title}
    </h1>
  {/if}
  <div class="ml-auto shrink-0">
    <ModeToggle />
  </div>
</header>
