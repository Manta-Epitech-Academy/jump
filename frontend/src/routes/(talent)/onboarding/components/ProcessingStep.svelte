<script lang="ts">
  import { onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import { fade } from 'svelte/transition';

  let formEl: HTMLFormElement;
  let textIndex = $state(0);
  // The advance is fire-on-mount, so a failed POST would otherwise leave the
  // student stuck on this animation forever (processingCompletedAt never set →
  // load keeps returning 'processing'). Surface a manual retry instead.
  let failed = $state(false);

  const messages = [
    'Analyse de ton profil...',
    'Personnalisation de ton espace...',
    'Préparation de tes missions...',
  ];

  onMount(() => {
    const interval = setInterval(() => {
      if (textIndex < messages.length - 1) {
        textIndex++;
      }
    }, 800);

    const timer = setTimeout(() => {
      formEl.requestSubmit();
    }, 2500);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  });
</script>

<div class="flex flex-col items-center justify-center py-16 text-center">
  <div
    class="relative mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-epi-blue/10"
  >
    <Sparkles class="h-10 w-10 animate-pulse text-epi-blue" />
    <div
      class="absolute inset-0 animate-ping rounded-full ring-4 ring-epi-blue/20"
    ></div>
  </div>

  <div class="h-8">
    {#if failed}
      <p in:fade={{ duration: 200 }} class="text-sm text-destructive">
        Une erreur est survenue.
        <button
          type="button"
          class="font-semibold underline"
          onclick={() => {
            failed = false;
            formEl.requestSubmit();
          }}
        >
          Réessayer
        </button>
      </p>
    {:else}
      {#key textIndex}
        <p
          in:fade={{ duration: 200 }}
          class="text-lg font-bold tracking-wide text-foreground-secondary uppercase"
        >
          {messages[textIndex]}
        </p>
      {/key}
    {/if}
  </div>
</div>

<!-- Hidden form that auto-advances to the legal phase -->
<form
  bind:this={formEl}
  method="POST"
  action="?/advanceProcessing"
  use:enhance={() => {
    return async ({ result }) => {
      if (result.type === 'success') {
        await invalidateAll();
      } else {
        failed = true;
      }
    };
  }}
  class="hidden"
></form>
