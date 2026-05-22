<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { TransitionConfig } from 'svelte/transition';
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import ProgressBar from './components/ProgressBar.svelte';
  import ProfileStep from './components/ProfileStep.svelte';
  import InterestsStep from './components/InterestsStep.svelte';
  import EquipmentStep from './components/EquipmentStep.svelte';
  import RulesStep from './components/RulesStep.svelte';
  import BackButton from './components/BackButton.svelte';

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

  const SERVER_STEP_TO_MICRO: Record<string, number> = {
    profile: 1,
    interests: 2,
    equipment: 3,
    rules: 4,
  };

  const TOTAL_STEPS = 4;

  // svelte-ignore state_referenced_locally
  let microStep = $state(SERVER_STEP_TO_MICRO[data.step] ?? 1);
  // svelte-ignore state_referenced_locally
  let lastServerStep = $state(data.step);

  let goBackForm: HTMLFormElement;

  // Sync microStep when the server step changes (after form POST + redirect)
  $effect(() => {
    if (data.step !== lastServerStep) {
      lastServerStep = data.step;
      microStep = SERVER_STEP_TO_MICRO[data.step] ?? 1;
    }
  });

  const progress = $derived(Math.round((microStep / TOTAL_STEPS) * 100));

  const TITLES: Record<number, string> = {
    1: 'Ton profil',
    2: "Centres d'intérêt",
    3: 'Ton matériel',
    4: 'Règlement',
  };
  const pageTitle = $derived(TITLES[microStep] ?? 'Onboarding');

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
    use:enhance
    class="hidden"
  ></form>

  <div class="relative z-10 flex flex-1 items-center justify-center p-4">
    <div class="w-full max-w-lg">
      <!-- Logo -->
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
        {#key microStep}
          <div
            class="w-full"
            in:fly|local={{ x: 30, duration: 300, delay: 280 }}
            out:exitSlide|local={{ duration: 250 }}
          >
            {#if microStep === 1}
              <ProfileStep profile={data.profile!} errors={form?.errors} />
            {:else if microStep === 2}
              <BackButton onclick={goBackServer} />
              <InterestsStep
                techInterests={data.techInterests ?? []}
                generalInterests={data.generalInterests ?? []}
                selectedTechIds={data.selectedTechIds ?? []}
                selectedGeneralIds={data.selectedGeneralIds ?? []}
                freeText={data.freeText ?? ''}
                error={form?.error}
              />
            {:else if microStep === 3}
              <BackButton onclick={goBackServer} />
              <EquipmentStep
                hasLaptop={data.hasLaptop ?? false}
                setupDescription={data.setupDescription ?? ''}
                error={form?.error}
              />
            {:else if microStep === 4}
              <BackButton onclick={goBackServer} />
              <RulesStep error={form?.error} />
            {/if}
          </div>
        {/key}
      </div>
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
