<script lang="ts">
  import { Camera, CheckCircle } from '@lucide/svelte';
  import { renderMarkdown } from '$lib/markdown';
  import droitImageBodyMd from '$lib/content/droit-image-body.md?raw';
  import { fly } from 'svelte/transition';
  import ChildSignForm from './ChildSignForm.svelte';

  const droitImageBody = renderMarkdown(droitImageBodyMd);

  let { data, form } = $props();
</script>

<div
  class="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 p-4 transition-colors duration-500 dark:bg-slate-950"
>
  <div
    class="absolute -top-20 -right-20 h-100 w-100 rounded-full bg-epi-blue/10 blur-[100px] dark:bg-epi-blue/20"
  ></div>
  <div
    class="absolute -bottom-20 -left-20 h-100 w-100 rounded-full bg-epi-teal/10 blur-[100px] dark:bg-epi-teal/20"
  ></div>
  <div
    class="absolute inset-0 bg-[radial-gradient(var(--color-slate-200)_1px,transparent_1px)] bg-size-[32px_32px] opacity-50 dark:bg-[radial-gradient(var(--color-slate-800)_1px,transparent_1px)]"
  ></div>

  <div class="z-10 w-full max-w-lg">
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
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {#if data.children.length > 1}
          Veuillez signer pour chacun de vos enfants
        {:else}
          Veuillez signer pour votre enfant
        {/if}
      </p>
    </div>

    <!-- Success message -->
    {#if form?.success}
      <div
        in:fly={{ y: -10, duration: 300 }}
        class="mb-4 flex items-center gap-3 rounded-xl bg-green-50 px-4 py-3 dark:bg-green-900/30"
      >
        <CheckCircle
          class="h-5 w-5 shrink-0 text-green-600 dark:text-green-400"
        />
        <p class="text-sm text-green-700 dark:text-green-300">
          L'autorisation pour <strong>{form.success}</strong> a été signée avec succès.
        </p>
      </div>
    {/if}

    <!-- Global error (not scoped to a child) -->
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

    <p
      class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase"
    >
      Espace Parents — Epitech Academy
    </p>
  </div>
</div>
