<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { TransitionConfig } from 'svelte/transition';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';
  import ProgressBar from './components/ProgressBar.svelte';
  import IdentityStep from './components/IdentityStep.svelte';
  import SchoolStep from './components/SchoolStep.svelte';
  import ParentsStep from './components/ParentsStep.svelte';
  import InterestsStep from './components/InterestsStep.svelte';
  import EquipmentStep from './components/EquipmentStep.svelte';
  import ProcessingStep from './components/ProcessingStep.svelte';
  import CharterStep from './components/CharterStep.svelte';
  import RulesStep from './components/RulesStep.svelte';
  import BackButton from './components/BackButton.svelte';
  import Check from '@lucide/svelte/icons/check';

  function exitSlide(
    _node: Element,
    { duration = 250 }: { duration?: number } = {},
  ): TransitionConfig {
    return {
      duration,
      css: (t: number, u: number) =>
        `position: absolute; top: 0; left: 0; right: 0; opacity: ${t}; transform: translateX(${-30 * u}px);`,
    };
  }

  let { data, form } = $props();

  // The server (`getCurrentStep` in load) is the single source of truth for the
  // step. Render directly off `data.step` — keying the view on it means each step
  // component is created/destroyed in lockstep with its own data shape, so a step
  // never re-renders against the next step's payload (which omits its props).
  const STEP_INFO: Record<string, { index: number; title: string }> = {
    identity: { index: 1, title: 'Qui es-tu ?' },
    school: { index: 2, title: "D'où viens-tu ?" },
    parents: { index: 3, title: "Contacts d'urgence" },
    interests: { index: 4, title: "Centres d'intérêt" },
    equipment: { index: 5, title: 'Ton matériel' },
    processing: { index: 6, title: 'Génération...' },
    charter: { index: 7, title: 'Sécurité' },
    rules: { index: 8, title: 'Dernière étape' },
  };
  const TOTAL_STEPS = 8;

  let goBackForm: HTMLFormElement;

  const stepIndex = $derived(STEP_INFO[data.step]?.index ?? 1);
  // Treat the current step as half-done so the bar advances each step yet never
  // reads 100% until the final redirect away — being *on* the last step isn't
  // "finished". (stepIndex/TOTAL hit 100% on the rules step before signing.)
  const progress = $derived(
    Math.round(((stepIndex - 0.5) / TOTAL_STEPS) * 100),
  );
  const pageTitle = $derived(STEP_INFO[data.step]?.title ?? 'Onboarding');

  function goBackServer() {
    goBackForm.requestSubmit();
  }
</script>

<svelte:head>
  <title>{pageTitle} — Bienvenue</title>
</svelte:head>

<ProgressBar {progress} />

<div
  class="relative flex min-h-screen w-full flex-col overflow-hidden bg-slate-50 transition-colors duration-500 dark:bg-slate-950"
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

  <!-- Hidden form for server-side go-back -->
  <form
    bind:this={goBackForm}
    method="POST"
    action="?/goBack"
    use:enhance={() => {
      return async ({ result, update }) => {
        if (result.type === 'success') {
          await invalidateAll();
          return;
        }
        await update();
      };
    }}
    class="hidden"
  ></form>

  <div class="relative z-10 flex flex-1 items-center justify-center p-4">
    <div class="w-full max-w-lg">
      <div class="mb-6">
        <a href={resolve('/')} aria-label="Accueil">
          <img
            src="/EPITECH-LOGO-BLEU-2025.svg"
            alt="Epitech"
            class="h-9 w-auto dark:brightness-0 dark:invert"
          />
        </a>
      </div>

      <div class="relative">
        {#key data.step}
          <div
            class="w-full"
            in:fly|local={{ x: 30, duration: 250, delay: 180 }}
            out:exitSlide|local={{ duration: 180 }}
          >
            {#if data.step === 'identity'}
              <IdentityStep profile={data.profile} errors={form?.errors} />
            {:else if data.step === 'school'}
              <BackButton onclick={goBackServer} />
              <SchoolStep profile={data.profile} errors={form?.errors} />
            {:else if data.step === 'parents'}
              <BackButton onclick={goBackServer} />
              <ParentsStep profile={data.profile} errors={form?.errors} />
            {:else if data.step === 'interests'}
              <BackButton onclick={goBackServer} />
              <InterestsStep
                techInterests={data.techInterests ?? []}
                generalInterests={data.generalInterests ?? []}
                selectedTechIds={data.selectedTechIds ?? []}
                selectedGeneralIds={data.selectedGeneralIds ?? []}
                freeText={data.freeText ?? ''}
                shuffleSeed={data.shuffleSeed ?? ''}
                error={form?.error}
              />
            {:else if data.step === 'equipment'}
              <BackButton onclick={goBackServer} />
              <EquipmentStep
                hasLaptop={data.hasLaptop ?? false}
                setupDescription={data.setupDescription ?? ''}
                error={form?.error}
              />
            {:else if data.step === 'processing'}
              <ProcessingStep />
            {:else if data.step === 'charter'}
              <BackButton onclick={goBackServer} />
              <CharterStep error={form?.error} />
            {:else if data.step === 'rules'}
              <BackButton onclick={goBackServer} />
              <RulesStep error={form?.error} />
            {/if}
          </div>
        {/key}
      </div>

      {#if data.step !== 'processing'}
        <p
          class="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400 dark:text-slate-500"
        >
          <Check class="h-3.5 w-3.5 text-epi-teal-solid dark:text-epi-teal" />
          Chaque étape validée est enregistrée — tu peux reprendre plus tard.
        </p>
      {/if}
    </div>
  </div>

  <footer
    class="relative z-10 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400"
  >
    <span class="font-heading tracking-wide text-epi-blue">Jump</span>, la
    plateforme qui t'accompagne lors de tes stages et coding clubs à Epitech.
  </footer>
</div>
