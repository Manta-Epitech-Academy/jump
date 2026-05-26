<script lang="ts">
  import Camera from '@lucide/svelte/icons/camera';
  import CheckCircle from '@lucide/svelte/icons/check-circle';
  import { resolve } from '$app/paths';
  import { renderMarkdown } from '$lib/markdown';
  import droitImageBodyMd from '$lib/content/droit-image-body.md?raw';
  import { fly } from 'svelte/transition';
  import ChildSignForm from './ChildSignForm.svelte';

  const droitImageBody = renderMarkdown(droitImageBodyMd);

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Droit à l'image — Espace Parent</title>
</svelte:head>

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

  <!-- ═══ Scrollable content ═══ -->
  <main class="relative z-10 flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-lg px-4 py-8">
      <!-- Header -->
      <div class="mb-6 text-center">
        <div
          class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
        >
          <Camera class="h-7 w-7" />
        </div>
        <h1
          class="font-heading text-2xl tracking-tight text-epi-blue uppercase dark:text-epi-blue"
        >
          Droit à l'image
        </h1>
      </div>

      <!-- Success message -->
      {#if form?.success}
        <div
          in:fly={{ y: -10, duration: 300 }}
          class="mb-4 flex items-center gap-3 rounded-xl border border-green-200/60 bg-green-50/80 px-4 py-3 dark:border-green-800/50 dark:bg-green-900/30"
        >
          <CheckCircle
            class="h-5 w-5 shrink-0 text-green-600 dark:text-green-400"
          />
          <p class="text-sm text-green-700 dark:text-green-300">
            L'autorisation pour <strong>{form.success}</strong> a été signée avec
            succès.
          </p>
        </div>
      {/if}

      <!-- Global error -->
      {#if form?.error && !form?.talentId}
        <p
          class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400"
        >
          {form.error}
        </p>
      {/if}

      <!-- Per-child forms -->
      {#each data.children as child (child.id)}
        <ChildSignForm
          {child}
          {droitImageBody}
          error={form?.talentId === child.id ? form.error : undefined}
        />
      {/each}
    </div>
  </main>

  <!-- ═══ Footer sticky ═══ -->
  <footer
    class="relative z-10 shrink-0 border-t border-slate-300/50 bg-slate-100/80 px-4 py-4 text-center text-xs text-slate-400 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-950/80 dark:text-slate-500"
  >
    <span class="font-heading tracking-wide text-epi-blue">Jump</span>, la
    plateforme qui t'accompagne lors de tes stages et coding clubs à Epitech.
  </footer>
</div>
