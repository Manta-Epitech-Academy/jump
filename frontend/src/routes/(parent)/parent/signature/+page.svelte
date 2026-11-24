<script lang="ts">
  import Camera from '@lucide/svelte/icons/camera';
  import CheckCircle from '@lucide/svelte/icons/check-circle';
  import { renderMarkdown } from '#lib/markdown.ts';
  import {
    CURRENT_DROIT_IMAGE_VERSION,
    droitImageClausesFor,
  } from '#lib/content/droit-image/index.ts';
  import { enter } from '#lib/motion/index.ts';
  import ParentFlowShell from '#lib/components/parent/ParentFlowShell.svelte';
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

  // What was just decided, and for whom: the message of the form that was sent.
  // The child drops out of the reloaded list, so the page announces it.
  const decided = $derived(form?.form?.message);
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
      {#if decided?.signedFor}
        <div
          in:enter={{ y: -12 }}
          class="mb-4 flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3"
        >
          <CheckCircle class="h-5 w-5 shrink-0 text-success" />
          <p class="text-sm text-success">
            {#if decided.decision === 'refused'}
              Le refus pour <strong>{decided.signedFor}</strong> a bien été enregistré.
            {:else}
              L'autorisation pour <strong>{decided.signedFor}</strong> a été signée
              avec succès.
            {/if}
          </p>
        </div>
      {/if}

      <!-- Per-child forms -->
      {#each data.children as child (child.id)}
        <ChildSignForm
          {child}
          form={child.form}
          {droitImageBody}
          {droitImageRefusalBody}
        />
      {/each}
    </div>
  </main>
</ParentFlowShell>
