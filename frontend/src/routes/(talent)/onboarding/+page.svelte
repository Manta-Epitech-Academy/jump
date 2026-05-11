<script lang="ts">
  import InfoValidationStep from './components/InfoValidationStep.svelte';
  import LyceeStep from './components/LyceeStep.svelte';
  import InterestsStep from './components/InterestsStep.svelte';
  import InterestsRecapStep from './components/InterestsRecapStep.svelte';
  import RulesStep from './components/RulesStep.svelte';

  let { data, form } = $props();

  const STEP_CONFIG: Record<string, { number: number; title: string }> = {
    'info-validation': { number: 1, title: 'Mes informations' },
    lycee: { number: 2, title: 'Mon lycée' },
    'interests-tech': { number: 3, title: 'Informatique' },
    'interests-general': { number: 4, title: "Centres d'intérêt" },
    'interests-recap': { number: 5, title: 'Ton profil' },
    rules: { number: 6, title: 'Règlement' },
  };

  const TOTAL_STEPS = Object.keys(STEP_CONFIG).length;
  const stepNumber = $derived(STEP_CONFIG[data.step].number);
  const stepTitle = $derived(STEP_CONFIG[data.step].title);
</script>

<svelte:head>
  <title>{stepTitle} — Bienvenue</title>
</svelte:head>

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
    <div class="mb-6 text-center">
      <span
        class="inline-block rounded-full bg-epi-blue/10 px-3 py-1 text-xs font-medium text-epi-blue dark:bg-epi-blue/20"
      >
        &Eacute;tape {stepNumber} / {TOTAL_STEPS}
      </span>
    </div>

    {#if data.step === 'info-validation'}
      <InfoValidationStep
        profile={(form?.values as typeof data.profile) ?? data.profile}
        errors={form?.errors}
      />
    {:else if data.step === 'lycee'}
      <LyceeStep
        highSchoolName={data.highSchoolName}
        highSchoolCity={data.highSchoolCity}
        error={form?.error}
      />
    {:else if data.step === 'interests-tech'}
      <InterestsStep
        interests={data.interests}
        selectedIds={data.selectedIds}
        error={form?.error}
        kind="tech"
        maxSelect={2}
        actionName="validateTechInterests"
      />
    {:else if data.step === 'interests-general'}
      <InterestsStep
        interests={data.interests}
        selectedIds={data.selectedIds}
        error={form?.error}
        kind="general"
        maxSelect={5}
        actionName="validateGeneralInterests"
        techSelections={data.techSelections}
      />
    {:else if data.step === 'interests-recap'}
      <InterestsRecapStep
        techSelections={data.techSelections}
        generalSelections={data.generalSelections}
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
