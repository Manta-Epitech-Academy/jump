<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { TransitionConfig } from 'svelte/transition';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';
  import ProgressBar from './components/ProgressBar.svelte';
  import ProfileStep from './components/ProfileStep.svelte';
  import InterestsStep from './components/InterestsStep.svelte';
  import EquipmentStep from './components/EquipmentStep.svelte';
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
    profile: { index: 1, title: 'Ton profil' },
    interests: { index: 2, title: "Centres d'intérêt" },
    equipment: { index: 3, title: 'Ton matériel' },
    charter: { index: 4, title: 'Charte RGPD' },
    rules: { index: 5, title: 'Règlement' },
  };
  const TOTAL_STEPS = 5;

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
      <!-- Logo + step counter -->
      <div class="mb-6 flex items-center justify-between">
        <a href={resolve('/')} aria-label="Accueil">
          <img
            src="/EPITECH-LOGO-BLEU-2025.svg"
            alt="Epitech"
            class="h-9 w-auto dark:brightness-0 dark:invert"
          />
        </a>
        <span
          class="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm backdrop-blur-xl dark:bg-slate-900/80 dark:text-slate-400"
        >
          Étape {stepIndex} / {TOTAL_STEPS}
        </span>
      </div>

      <div class="relative">
        {#key data.step}
          <div
            class="w-full"
            in:fly|local={{ x: 30, duration: 250, delay: 180 }}
            out:exitSlide|local={{ duration: 180 }}
          >
            {#if data.step === 'profile' && data.profile}
              <ProfileStep profile={data.profile} errors={form?.errors} />
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

      <p
        class="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400 dark:text-slate-500"
      >
        <Check class="h-3.5 w-3.5 text-epi-teal-solid dark:text-epi-teal" />
        Chaque étape validée est enregistrée — tu peux reprendre plus tard.
      </p>
    </div>
  </div>

  <!-- Footer -->
  <footer
    class="relative z-10 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400"
  >
    <span class="font-heading tracking-wide text-epi-blue">Jump</span>, la
    plateforme qui t'accompagne lors de tes stages et coding clubs à Epitech.
  </footer>
</div>
