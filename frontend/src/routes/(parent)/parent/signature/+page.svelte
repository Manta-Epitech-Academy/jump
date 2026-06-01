<script lang="ts">
  import Camera from '@lucide/svelte/icons/camera';
  import CheckCircle from '@lucide/svelte/icons/check-circle';
  import { renderMarkdown } from '$lib/markdown';
  import droitImageBodyMd from '$lib/content/droit-image-body.md?raw';
  import droitImageRefusalBodyMd from '$lib/content/droit-image-refusal-body.md?raw';
  import { fly } from 'svelte/transition';
  import ParentFlowShell from '$lib/components/parent/ParentFlowShell.svelte';
  import ChildSignForm from './ChildSignForm.svelte';

  const droitImageBody = renderMarkdown(droitImageBodyMd);
  const droitImageRefusalBody = renderMarkdown(droitImageRefusalBodyMd);

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Droit à l'image — Espace Parent</title>
</svelte:head>

<ParentFlowShell>
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
            {#if form.decision === 'refused'}
              Le refus pour <strong>{form.success}</strong> a bien été enregistré.
            {:else}
              L'autorisation pour <strong>{form.success}</strong> a été signée avec
              succès.
            {/if}
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
          {droitImageRefusalBody}
          error={form?.talentId === child.id ? form.error : undefined}
        />
      {/each}
    </div>
  </main>
</ParentFlowShell>
