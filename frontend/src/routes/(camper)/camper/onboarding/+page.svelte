<script lang="ts">
  import CharterStep from './components/CharterStep.svelte';
  import RulesStep from './components/RulesStep.svelte';
  import ImageRightsStep from './components/ImageRightsStep.svelte';

  let { data, form } = $props();

  const stepNumber = $derived(
    data.step === 'charter' ? 1 : data.step === 'rules' ? 2 : 3,
  );
</script>

<div
  class="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 p-4 transition-colors duration-500 dark:bg-slate-950"
>
  <!-- Visual background elements -->
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
    <!-- Step indicator -->
    <div class="mb-6 text-center">
      <span
        class="inline-block rounded-full bg-epi-blue/10 px-3 py-1 text-xs font-medium text-epi-blue dark:bg-epi-blue/20"
      >
        &Eacute;tape {stepNumber} / 3
      </span>
    </div>

    {#if data.step === 'charter'}
      <CharterStep />
    {:else if data.step === 'rules'}
      <RulesStep />
    {:else if data.step === 'image-rights'}
      <ImageRightsStep error={form?.error} />
    {/if}

    <p
      class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase"
    >
      Propuls&eacute; par Epitech Academy
    </p>
  </div>
</div>
