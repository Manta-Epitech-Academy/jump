<script lang="ts">
  import InfoValidationStep from './components/InfoValidationStep.svelte';
  import RulesStep from './components/RulesStep.svelte';

  let { data, form } = $props();

  const stepNumber = $derived(data.step === 'info-validation' ? 1 : 2);
</script>

<svelte:head>
  <title
    >{data.step === 'info-validation' ? 'Mes informations' : 'Règlement'} — Bienvenue</title
  >
</svelte:head>

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
        &Eacute;tape {stepNumber} / 2
      </span>
    </div>

    {#if data.step === 'info-validation'}
      <InfoValidationStep
        profile={(form?.values as typeof data.profile) ?? data.profile}
        errors={form?.errors}
      />
    {:else if data.step === 'rules'}
      <RulesStep error={form?.error} />
    {/if}

    <p
      class="mt-8 text-center text-[10px] font-bold tracking-widest text-slate-400 uppercase"
    >
      Propuls&eacute; par Epitech Academy
    </p>
  </div>
</div>
