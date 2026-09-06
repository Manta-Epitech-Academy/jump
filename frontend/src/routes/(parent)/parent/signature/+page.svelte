<script lang="ts">
  import Camera from '@lucide/svelte/icons/camera';
  import CheckCircle from '@lucide/svelte/icons/check-circle';
  import { renderMarkdown } from '$lib/markdown';
  import {
    CURRENT_DROIT_IMAGE_VERSION,
    droitImageClausesFor,
  } from '$lib/content/droit-image';
  import { fly } from 'svelte/transition';
  import ParentFlowShell from '$lib/components/parent/ParentFlowShell.svelte';
  import ChildSignForm from './ChildSignForm.svelte';

  // The clauses of the document about to be signed, taken FROM that document
  // rather than hand-copied beside it. A decision taken now commits to the
  // current version, so that is the wording shown.
  const droitImageBody = renderMarkdown(
    droitImageClausesFor(CURRENT_DROIT_IMAGE_VERSION, 'accepted'),
  );
  const droitImageRefusalBody = renderMarkdown(
    droitImageClausesFor(CURRENT_DROIT_IMAGE_VERSION, 'refused'),
  );

  let { data, form } = $props();
</script>

<svelte:head>
  <title>Droit à l'image - Espace Parent</title>
</svelte:head>

<ParentFlowShell>
  <!-- ═══ Scrollable content ═══ -->
  <main class="relative z-10 flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-lg px-4 py-8">
      <!-- Header -->
      <div class="mb-6 text-center">
        <div
          class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-epi-blue text-white shadow-raised"
        >
          <Camera class="h-7 w-7" />
        </div>
        <h1 class="font-heading text-display-m text-epi-blue">
          Droit à l'image
        </h1>
      </div>

      <!-- Success message -->
      {#if form?.success}
        <div
          in:fly={{ y: -10, duration: 300 }}
          class="mb-4 flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3"
        >
          <CheckCircle class="h-5 w-5 shrink-0 text-success" />
          <p class="text-sm text-success">
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
          class="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
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
